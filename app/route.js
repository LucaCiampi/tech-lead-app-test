const formValidator = require('./form_validator');
const photoModel = require('./photo_model');
const ZipStream = require('zip-stream');
const { Storage } = require('@google-cloud/storage');
const request = require('request');
const Stream = require('stream');
const moment = require('moment');
const listenForMessages = require('./listenForMessages');
const { PubSub } = require('@google-cloud/pubsub');

const subscriptionNameOrId = process.env.SUBSCRIPTION_NAME || 'dmii2-1';
const timeout = process.env.TIMEOUT || 60;
function route(app) {
  app.get('/', async (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;

    // Luca
    listenForMessages(subscriptionNameOrId, timeout);
    // End Luca

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
        .file('public/users/photos-archive.zip')
        .getSignedUrl(options);
      ejsLocalVariables.downloadLink = signedUrls[0];
    } catch (err) {
      console.error('Error fetching signed URL:', err);
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

  let storage = new Storage();

  function uploadFile(buffer, filename, profileBucket) {
    const file = storage.bucket(profileBucket).file('public/users/' + filename);

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
      });

      const bufferStream = new Stream.PassThrough();
      bufferStream.end(buffer);
      bufferStream.pipe(stream);
    });
  }

  app.post('/zip', (req, res) => {
    const tags = req.query.tags;
    sendTopicToGCS(tags);
    const chunks = [];

    var zip = new ZipStream();

    zip.on('data', chunk => {
      chunks.push(chunk);
    });

    zip.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const dmiiBucketName = 'dmii2023bucket';
      uploadFile(buffer, 'photos-archive.zip', dmiiBucketName)
        .then(() => {
          res.send('ZIP file uploaded to GCS!');
        })
        .catch(err => {
          console.error('GCS Error:', err);
          res.status(500).send('Internal Server Error during upload to GCS.');
        });
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
}

module.exports = route;
