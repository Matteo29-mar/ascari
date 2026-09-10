import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../lib/stripe";
import { syncDealerSubscriptionFromStripe } from "../services/dealerSubscriptionService";

export async function dealerSubscriptionWebhook(req: Request, res: Response) {
  const signature = req.headers["stripe-signature"];
  const webhookSecret =
    process.env.STRIPE_DEALER_SUBSCRIPTION_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || Array.isArray(signature)) {
    return res.status(400).send("Missing Stripe signature");
  }

  if (!webhookSecret) {
    console.error("STRIPE_DEALER_SUBSCRIPTION_WEBHOOK_SECRET non configurato");
    return res.status(500).send("Webhook secret non configurato");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error: any) {
    console.error("Firma webhook Stripe non valida:", error?.message || error);
    return res.status(400).send(`Webhook Error: ${error?.message || "invalid signature"}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncDealerSubscriptionFromStripe(subscription);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncDealerSubscriptionFromStripe(subscription);
        break;
      }

      default:
        break;
    }

    return res.json({ received: true });
  } catch (error: any) {
    console.error("Errore gestione webhook abbonamento dealer:", error);
    return res.status(500).json({
      error: error?.message || "Webhook processing error",
    });
  }
}
