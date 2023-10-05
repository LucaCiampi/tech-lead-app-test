const express = require('express');
const favicon = require('serve-favicon');
const path = require('path');
require('dotenv').config();
const listenForMessages = require('./listenForMessages.js');

const app = express();

// public assets
app.use(express.static(path.join(__dirname, 'public')));
app.use(favicon(path.join(__dirname, 'public/images', 'favicon.ico')));
app.use('/coverage', express.static(path.join(__dirname, '..', 'coverage')));

// ejs for view templates
app.engine('.html', require('ejs').__express);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

// load route
require('./route')(app);

// server
const port = process.env.PORT || 3000;
app.server = app.listen(port);
console.log(`listening on port ${port}`);

// Luca
const subscriptionNameOrId = process.env.SUBSCRIPTION_NAME || 'dmii2-1';
const timeout = process.env.TIMEOUT || 60;
listenForMessages(subscriptionNameOrId, timeout);

module.exports = app;
