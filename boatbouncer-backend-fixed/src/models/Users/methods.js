import Stripe from 'stripe';
import httpStatus from 'http-status';
import { startSession } from 'mongoose';
import APIError from '../../errors/APIError';
import { generateHashedPassword } from '../../utils';
import { modelNames } from '../constants';
import { stripeSecretKey } from '../../config/environments';
import { phoneNumberAlreadyUsed, stripeUpdateFailed } from './errors';

const stripe = new Stripe(stripeSecretKey);

const userEmailExists = new APIError(
  'User with this email already exists',
  httpStatus.CONFLICT,
  true
);

export async function createNewUser() {
  const session = await startSession();
  const Users = this.model(modelNames.USERS);

  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    try {
      await session.withTransaction(async () => {
        const { password, email, phoneNumber } = this;
        const existingEmail = await this.model(modelNames.USERS).findOne({
          email: email.toLowerCase(),
        });
        if (existingEmail?.verified) throw userEmailExists;

        const existingPhoneNumber = await this.model(modelNames.USERS).findOne({
          phoneNumber,
        });

        if (phoneNumber && existingPhoneNumber?.verified)
          throw phoneNumberAlreadyUsed;

        const hashedPassword = await generateHashedPassword(password);

        this.password = hashedPassword;

        const user = await this.save({ session });

        if (existingPhoneNumber)
          await this.model(modelNames.USERS)
            .findOneAndRemove({
              _id: existingPhoneNumber?._id,
            })
            .session(session);
        else if (existingEmail)
          await this.model(modelNames.USERS)
            .findOneAndRemove({
              _id: existingEmail?._id,
            })
            .session(session);

        const cleanUser = user.clean();
        await session.commitTransaction();
        resolve(cleanUser);
      });
    } catch (error) {
      // FIX #10: removed duplicate session.endSession() from catch block
      // (finally block handles cleanup)
      reject(error);
    } finally {
      await session.endSession();
    }
  });
}

export function clean() {
  const userObj = this.toObject({ virtuals: true });
  delete userObj.password;

  delete userObj?.appleIdTemp;
  delete userObj?.googleIdTemp;
  delete userObj?.facebookIdTemp;

  return userObj;
}
