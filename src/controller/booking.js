import httpStatus from 'http-status';
import APIError from '../errors/APIError';
import Boats from '../models/Boats';
import Bookings from '../models/Bookings';
import Users from '../models/Users';
import { boatListTypes, bookingStatus, pricingType } from '../utils/constants';
import { sendMessage } from '../utils/twilio';
import { addHoursToDate, formatDuration } from '../utils';
import Messages from '../models/Messages';

function calculateActivityBoatPrice(peopleCount, pricing) {
  const price = pricing.perPerson * peopleCount;
  let renterPrice = price;
  let discountPercentage = 0;
  const sortedDiscounts = pricing.discountPercentage?.sort(
    (a, b) => b.minPeople - a.minPeople
  );

  const applicableDiscount = sortedDiscounts?.find(
    (discount) => peopleCount >= discount.minPeople
  );
  if (applicableDiscount) {
    renterPrice -= (price * applicableDiscount.percentage) / 100;
    discountPercentage = applicableDiscount.percentage;
  }

  return { renterPrice, price, discountPercentage };
}

function calculateRentalBoatPrice(period, pricing, type) {
  if (type === pricingType.PER_DAY && period.days < pricing?.minDays)
    throw new APIError(
      `Number of days should be greater than ${pricing?.minDays}`,
      httpStatus.BAD_REQUEST
    );
  if (type === pricingType.PER_HOUR && period.hours < pricing.minHours)
    throw new APIError(
      `Number of hours should be greater than ${pricing.minHours}`,
      httpStatus.BAD_REQUEST
    );

  const price =
    type === pricingType.PER_DAY
      ? pricing.perDay * period.days
      : pricing.perHour * period.hours;
  let renterPrice = price;
  let discountPercentage = 0;

  const sortedDiscounts =
    type === pricingType.PER_DAY
      ? pricing?.dayDiscount?.sort((a, b) => b.minPeople - a.minPeople)
      : pricing?.hourDiscount?.sort((a, b) => b.minPeople - a.minPeople);

  const applicableDiscount = sortedDiscounts
    ? sortedDiscounts.find((discount) => {
        if (type === pricingType.PER_DAY)
          return period.days >= discount?.minDaysForDiscount;
        if (type === pricingType.PER_HOUR)
          return period.hours >= discount.minHoursForDiscount;
        return period.days >= discount.minDaysForDiscount;
      })
    : null;
  if (applicableDiscount) {
    renterPrice -= (price * applicableDiscount.discountPercentage) / 100;
    discountPercentage = applicableDiscount.discountPercentage;
  }

  return { price, renterPrice, discountPercentage };
}

/**
 * It creates a new booking and saves it to the database.
 */
export const createBookingController = async (req, res, next) => {
  try {
    const { boatId, type, duration, days, noPeople, hours, activityType } =
      req.body;

    const id = req?.user?._id;

    let boakingParam = {
      boatId,
      type,
      duration,
      renter: id,
      status: bookingStatus.PENDING,
    };
    boakingParam.duration.start = new Date(duration.start);

    const boat = await Boats.getBoat({ boatId });
    // FIX #1: was `throw new 'Boat not found'()` — invalid syntax
    if (!boat) throw new Error('Boat not found');
    const listingType = boat?.listingType;

    if (boat.blockedSchedule && boat.blockedSchedule.length > 0) {
      const bookingStart = new Date(duration.start);
      const bookingEnd = new Date(duration.end);

      const blockedPeriod = boat.blockedSchedule.find((blocked) => {
        const blockedStart = new Date(blocked.start);
        const blockedEnd = new Date(blocked.end);

        return (
          (bookingStart >= blockedStart && bookingStart < blockedEnd) ||
          (bookingEnd > blockedStart && bookingEnd <= blockedEnd) ||
          (bookingStart <= blockedStart && bookingEnd >= blockedEnd)
        );
      });

      if (blockedPeriod) {
        const reasonMessage =
          blockedPeriod.reason && blockedPeriod.reason.trim() !== ''
            ? ` due to: ${blockedPeriod.reason}`
            : ' due to owner schedule blocking';

        throw new APIError(
          `This time period is not available${reasonMessage}`,
          httpStatus.BAD_REQUEST
        );
      }
    }

    if (listingType === boatListTypes.RENTAL) {
      const isTypeValid = [pricingType.PER_HOUR, pricingType.PER_DAY].includes(
        type
      );
      if (!isTypeValid)
        throw new APIError(
          `Invalid booking type for ${listingType} boat `,
          httpStatus.BAD_REQUEST
        );
      if (type === pricingType.PER_HOUR) {
        if (!hours)
          throw new APIError(
            `Hours are required for ${pricingType.PER_HOUR} pricing `,
            httpStatus.BAD_REQUEST
          );
        boakingParam.hours = hours;
        boakingParam.days = 0;
        boakingParam.duration = {
          ...duration,
          end: addHoursToDate(duration.start, hours),
        };
      }

      if (type === pricingType.PER_DAY) {
        if (!days)
          throw new APIError(
            `Days are required for ${pricingType.PER_HOUR} pricing `,
            httpStatus.BAD_REQUEST
          );

        boakingParam.days = days;
        boakingParam.hours = 0;
        boakingParam.duration = {
          ...duration,
          end: addHoursToDate(duration.start, days * 24),
        };
      }

      boakingParam = {
        ...boakingParam,
        ...calculateRentalBoatPrice({ hours, days }, boat.pricing, type),
      };
    }

    if (listingType === boatListTypes.ACTIVITY) {
      const isTypeValid = [pricingType.PER_PERSON].includes(type);
      if (!isTypeValid)
        throw new APIError(
          `Invalid booking type for ${listingType} boat `,
          httpStatus.BAD_REQUEST
        );

      if (!activityType)
        throw new APIError(
          `activity Type is required for for ${listingType} boat `,
          httpStatus.BAD_REQUEST
        );

      if (type === pricingType.PER_PERSON) {
        if (!noPeople)
          throw new APIError(
            `Number of people  is required for ${pricingType.PER_PERSON} pricing `,
            httpStatus.BAD_REQUEST
          );
      }
      boakingParam.noPeople = noPeople;
      boakingParam.activityType = activityType;
      const selectedAactivityType = boat?.activityTypes.find(
        ({ type: fechtecType }) => fechtecType === activityType
      );
      if (selectedAactivityType) {
        boakingParam.duration = {
          ...duration,
          end: addHoursToDate(
            duration.start,
            selectedAactivityType.durationHours
          ),
        };
      }
      boakingParam = {
        ...boakingParam,
        ...calculateActivityBoatPrice(noPeople, boat.pricing),
      };
    }

    const ownerId = boat.owner;
    const owner = await Users.findOne({ _id: ownerId });
    if (!owner) throw new Error('Owner not found');

    const booking = new Bookings({
      ...boakingParam,
    });

    const savedReservation = await booking.createBooking();
    const ownerPhoneNumber = owner.phoneNumber;

    const requesterFirstName = req?.user?.firstName ?? '';
    const requesterLastName = req?.user?.lastName ?? '';
    sendMessage(ownerPhoneNumber, 'bookingRequest', {
      requesterFirstName,
      requesterLastName,
      boatName: boat.boatName,
      duration: formatDuration(boakingParam.duration),
      bookingId: booking._id.toString(),
    });

    res.send(savedReservation);
  } catch (error) {
    next(error);
  }
};

export const cancelBookingController = async (req, res, next) => {
  try {
    const userId = req?.user?._id || ' ';
    const { bookId } = req.params;
    // FIX #2: isRenter from query string is always a string; coerce to boolean
    const isRenter = req.query.isRenter === 'true';

    const booking = await Bookings.getBooking({
      bookId,
      userId,
      isRenter,
    });

    let phoneNumber;
    let firstName;
    let lastName;

    const cancelledBooking = await Bookings.cancelBooking({
      bookId,
      userId,
      isRenter,
    });

    if (isRenter) {
      firstName = booking.renter.firstName;
      lastName = booking.renter.lastName;

      const ownerId = booking.owner;
      const owner = await Users.findOne({ _id: ownerId });

      if (!owner) throw new Error('Owner not found');
      phoneNumber = owner.phoneNumber;
    } else {
      firstName = booking.renter.firstName;
      lastName = booking.renter.lastName;
      phoneNumber = booking.renter.phoneNumber;
    }
    await Messages.readMessagesByConversationId({
      conversationId: cancelledBooking.conversationId,
      userId,
      force: true,
    });
    sendMessage(phoneNumber, 'bookingCancellation', {
      firstName,
      lastName,
      boatName: booking?.boatId?.boatName,
    });

    res.send(cancelledBooking);
  } catch (error) {
    next(error);
  }
};

export const getBookingsController = async (req, res, next) => {
  try {
    const userId = req?.user?._id || ' ';
    // FIX #2: coerce isRenter string to boolean
    const isRenter = req.query.isRenter === 'true';

    const bookings = await Bookings.getBookings({
      userId,
      isRenter,
    });
    res.send(bookings);
  } catch (error) {
    next(error);
  }
};

export const getBookingController = async (req, res, next) => {
  try {
    const userId = req?.user?._id || ' ';
    const { bookId } = req.params;
    // FIX #2: coerce isRenter string to boolean
    const isRenter = req.query.isRenter === 'true';

    const bookings = await Bookings.getBooking({
      bookId,
      userId,
      isRenter,
    });
    res.send(bookings);
  } catch (error) {
    next(error);
  }
};

export const getCanceledBookingsController = async (req, res, next) => {
  try {
    const userId = req?.user?._id || ' ';
    const { as } = req.query;
    const canceledBookings = await Bookings.getCanceledBookings({
      userId,
      as,
    });
    res.send(canceledBookings);
  } catch (error) {
    next(error);
  }
};

export const getCompletedBookingsController = async (req, res, next) => {
  try {
    const userId = req?.user?._id || ' ';
    const { as } = req.query;
    const completedBookings = await Bookings.getCompletedBookings({
      userId,
      as,
    });
    res.send(completedBookings);
  } catch (error) {
    next(error);
  }
};
