const formValidator = require('./form_validator');
const photoModel = require('./photo_model');
const request = require('request');
const ZipStream = require('zip-stream');

function route(app) {
  app.get('/', (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;

    const ejsLocalVariables = {
      tagsParameter: tags || '',
      tagmodeParameter: tagmode || '',
      photos: [],
      searchResults: false,
      invalidParameters: false
    };

    // if no input params are passed in then render the view with out querying the api
    if (!tags && !tagmode) {
      return res.render('index', ejsLocalVariables);
    }

    // validate query parameters
    if (!formValidator.hasValidFlickrAPIParams(tags, tagmode)) {
      ejsLocalVariables.invalidParameters = true;
      return res.render('index', ejsLocalVariables);
    }

    // get photos from flickr public feed api
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

  app.post('/zip', (req, res) => {
    const tags = req.query.tags;

    var zip = new ZipStream();
    zip.pipe(res);

    // Obtenez les photos à partir de votre modèle
    photoModel
      .getFlickrPhotos(tags)
      .then(photos => {
        // Transformez les résultats en URLs d'images et les ajoutez à la queue
        const queue = photos.map(photo => {
          return { name: `${photo.title}.jpg`, url: photo.media.b };
        });

        function addNextFile() {
          var elem = queue.shift();
          var stream = request(elem.url);
          zip.entry(stream, { name: elem.name }, err => {
            if (err) throw err;
            if (queue.length > 0) addNextFile();
            else zip.finalize();
          });
        }

        addNextFile();
      })
      .catch(err => {
        console.error('Error:', err);
        res.status(500).send('Internal Server Error');
      });
  });
}

module.exports = route;
