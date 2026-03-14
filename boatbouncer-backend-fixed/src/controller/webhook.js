import Stripe from 'stripe';
import Users from '../models/Users';
import PaymentIntents from '../models/PaymentIntents';
import { endpointSecret, stripeSecretKey } from '../config/environments';
import { intentStatus } from '../utils/constants';

const stripe = new Stripe(stripeSecretKey);

export const stripeWebHookController = async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      // FIX #4: return after next(err) to prevent executing switch on undefined event
      return next(err);
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        // eslint-disable-next-line no-console
        console.log(`Payment Succeeded ${event.data.object}`);
        await PaymentIntents.findOneAndUpdate(
          { intentId: event.data.object?.id },
          {
            status: intentStatus.COMPLETED,
          },
          { new: true }
        ).exec();
        break;
      case 'account.updated':
        // eslint-disable-next-line no-console
        console.log(`Onboarding Complete ${event.data.object}`);
        await Users.findOneAndUpdate(
          { stripeAccountId: event.data.object?.id },
          {
            chargesEnabled: event.data.object.charges_enabled,
          }
        );
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a 200 res to acknowledge receipt of the event
    return res.send();
  } catch (error) {
    return next(error);
  }
};
