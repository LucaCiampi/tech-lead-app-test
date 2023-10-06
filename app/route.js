const formValidator = require('./form_validator');
const photoModel = require('./photo_model');
const ZipStream = require('zip-stream');
const request = require('request');
const Stream = require('stream');
const moment = require('moment');
const listenForMessages = require('./listenForMessages');
const { PubSub } = require('@google-cloud/pubsub');

// Firebase
const { Storage } = require('@google-cloud/storage');
const admin = require('firebase-admin');
const serviceAccount = require('../google-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://temporaryprojectdmii-default-rtdb.firebaseio.com/'
});

const db = admin.database();
let storage = new Storage();
// End Firebase

const subscriptionNameOrId = process.env.SUBSCRIPTION_NAME || 'dmii2-1';
const timeout = process.env.TIMEOUT || 60;

// Middleware
function ensureAuthenticated(req, res, next) {
  // const currentUser = admin.auth().currentUser;
  // if (!currentUser) {
  //   return res.redirect('/login');
  // }
  next();
}

function route(app) {
  app.get('/', ensureAuthenticated, async (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;

    listenForMessages(
      subscriptionNameOrId,
      timeout,
      // displayDownloadLink.bind(null, res)
      () => {}
    );

    const ejsLocalVariables = {
      tagsParameter: tags || '',
      tagmodeParameter: tagmode || '',
      photos: [],
      searchResults: false,
      invalidParameters: false,
      downloadLink: null
    };

    if (!tags && !tagmode) {
      return res.render('index', ejsLocalVariables);
    }

    if (!formValidator.hasValidFlickrAPIParams(tags, tagmode)) {
      ejsLocalVariables.invalidParameters = true;
      return res.render('index', ejsLocalVariables);
    }

    return photoModel
      .getFlickrPhotos(tags, tagmode)
      .then(photos => {
        ejsLocalVariables.photos = photos;
        ejsLocalVariables.searchResults = true;

        return res.render('index', ejsLocalVariables);
      })
      .catch(error => {
        return res.status(500).send({ error });
      });
  });

  app.post('/zip', ensureAuthenticated, (req, res) => {
    const username = req.query.username || 'Unknown';
    const tags = req.query.tags;
    const chunks = [];
    const zipPath = `${username}/${Date.now()}/photos-archive`;

    var zip = new ZipStream();

    zip.on('data', chunk => {
      chunks.push(chunk);
    });

    zip.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      const dmiiBucketName = 'dmii2023bucket';
      try {
        await uploadFile(buffer, zipPath, dmiiBucketName);
        const downloadLink = await getDownloadLink(zipPath);
        res.send(downloadLink);
      } catch (err) {
        console.error('Error:', err);
        res.status(500).send('Internal Server Error');
      }
    });

    photoModel
      .getFlickrPhotos(tags)
      .then(photos => {
        const queue = photos.map(photo => {
          return { name: `${photo.title}.jpg`, url: photo.media.b };
        });

        function addNextFile() {
          if (queue.length === 0) {
            return zip.finalize();
          }

          var elem = queue.shift();
          var stream = request(elem.url);
          zip.entry(stream, { name: elem.name }, err => {
            if (err) throw err;
            addNextFile();
          });
        }

        addNextFile();
      })
      .catch(err => {
        console.error('Error:', err);
        res.status(500).send('Internal Server Error');
      });
  });

  app.get('/login', (req, res) => {
    res.render('login');
  });

  function uploadFile(buffer, zipPath, profileBucket) {
    const ref = db.ref(zipPath);
    ref.set(true);
    const file = storage.bucket(profileBucket).file(zipPath);

    const stream = file.createWriteStream({
      metadata: {
        contentType: 'application/zip',
        cacheControl: 'private'
      },
      resumable: false
    });

    return new Promise((resolve, reject) => {
      stream.on('error', err => {
        reject(err);
      });

      stream.on('finish', () => {
        resolve('Ok');
        getDownloadLink(zipPath);
      });

      const bufferStream = new Stream.PassThrough();
      bufferStream.end(buffer);
      bufferStream.pipe(stream);
    });
  }

  async function sendTopicToGCS(topicNameOrId) {
    // const projectId = subscriptionNameOrId;
    const subscriptionName = subscriptionNameOrId;
    // Instantiates a client
    const pubsub = new PubSub();

    // Creates a new topic
    const [topic] = await pubsub.createTopic(topicNameOrId);
    console.log(`Topic ${topic.name} created.`);

    // Creates a subscription on that new topic
    const [subscription] = await topic.createSubscription(subscriptionName);

    // Receive callbacks for new messages on the subscription
    subscription.on('message', message => {
      console.log('Received message:', message.data.toString());
      process.exit(0);
    });

    // Receive callbacks for errors on the subscription
    subscription.on('error', error => {
      console.error('Received error:', error);
      process.exit(1);
    });

    // Send a message to the topic
    topic.publishMessage({ data: Buffer.from('Test message!') });
  }

  async function getDownloadLink(zipPath) {
    const options = {
      action: 'read',
      expires:
        moment()
          .add(2, 'days')
          .unix() * 1000
    };
    try {
      const signedUrls = await storage
        .bucket(process.env.STORAGE_BUCKET)
        .file(zipPath + '.zip')
        .getSignedUrl(options);
      return signedUrls[0];
    } catch (err) {
      console.error('Error fetching signed URL:', err);
      throw err;
    }
  }

  async function displayDownloadLink(res) {
    const downloadLink = await getDownloadLink();
    res.send(`
      <script>
          window.open('${downloadLink}', '_blank');
      </script>
    `);
  }
}

module.exports = route;
