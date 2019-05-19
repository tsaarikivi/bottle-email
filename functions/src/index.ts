import * as sendgrid from '@sendgrid/mail';
import * as cors from 'cors';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();

const SENDGRID_KEY = functions.config().sendgrid.key;
sendgrid.setApiKey(SENDGRID_KEY);

const bottlesRef = admin.firestore().collection('bottles');

export const bottleCron = functions
  .region('europe-west1')
  .runWith({
    timeoutSeconds: 540,
    memory: '1GB'
  })
  .pubsub.schedule('0 * * * *')
  .onRun(async ctx => {
    const snapshot = await bottlesRef
      .where('status', '==', 'pending')
      .where('sendAt', '<=', admin.firestore.Timestamp.now())
      .get();

    const promises: Promise<any>[] = [];

    snapshot.docs.forEach(doc => {
      const bottle = doc.data() as Bottle;
      promises.push(sendEmail(bottle));
      promises.push(setStatus(doc.id));
    });

    return Promise.all(promises);
  });

function setStatus(id: string) {
  return bottlesRef.doc(id).update({
    status: 'complete',
    sentAt: admin.firestore.Timestamp.now()
  });
}

function sendEmail(bottle: Bottle) {
  const html = `
  <h4>Hi, it is I, you..</h4>
  <p>${bottle.text}</p>
  <p>Regards, you.</p>
  `;

  return sendgrid.send({
    html,
    subject: 'Your Bottle Email from the past',
    from: {
      email: 'noreply@bottle.email',
      name: 'Bottle Email'
    },
    to: {
      email: bottle.email
    }
  });
}

export const newBottle = functions
  .region('europe-west1')
  .https.onRequest((req, res) => {
    return cors({ origin: true })(req, res, async () => {
      const {
        email,
        text,
        time
      }: { email: string; text: string; time: string } = req.body;

      if (!email || !text || !time) {
        return res.status(422).send('Invalid arguments.');
      }

      const date = new Date(time);

      if (date < new Date()) {
        return res.status(400).send('Invalid time.');
      }

      const snapshot = await bottlesRef
        .where('email', '==', email)
        .where('status', '==', 'unconfirmed')
        .limit(3)
        .select()
        .get();

      if (snapshot.size > 2) {
        return res
          .status(451)
          .send('Too many unconfirmed bottles. Check your email!');
      }

      const timestamp = admin.firestore.Timestamp.fromDate(date);

      const body: Bottle = {
        createdAt: admin.firestore.Timestamp.now(),
        sendAt: timestamp,
        status: 'unconfirmed',
        email,
        text
      };

      const ref = await bottlesRef.add(body);

      const link = `https://europe-west1-bottle-email.cloudfunctions.net/confirmBottle?id=${
        ref.id
      }`;

      const html = `
      <h4>Confirmation required.</h4>
      <p>Confirm your Bottle Email from this link: <a href="${link}">${link}</a>.</p>
      <p>You'll recieve your Bottle Email at ${date.toUTCString()}.</p>
      <p><b>How exciting!</b> 🤩</p>
      <p>Regards, bottle.</p>
    `;

      await sendgrid.send({
        html,
        subject: 'Confirm your Bottle Email',
        from: {
          email: 'noreply@bottle.email',
          name: 'Bottle Email'
        },
        to: {
          email
        }
      });

      return res.status(200).send('Bottle created!');
    });
  });

export const confirmBottle = functions
  .region('europe-west1')
  .https.onRequest((req, res) => {
    return cors({ origin: true })(req, res, async () => {
      const { id }: { id: string } = req.query;

      if (!id) {
        return res.status(422).send('Invalid arguments.');
      }

      const ref = bottlesRef.doc(id);

      const doc = await ref.get();

      if (!doc.exists) {
        return res.status(400).send('Invalid document.');
      }

      await ref.update({
        status: 'pending',
        confirmedAt: admin.firestore.Timestamp.now()
      });

      return res.status(200).send('Bottle confirmed!');
    });
  });

interface Bottle {
  createdAt: FirebaseFirestore.Timestamp;
  sendAt: FirebaseFirestore.Timestamp;
  status: string;
  email: string;
  text: string;
}
