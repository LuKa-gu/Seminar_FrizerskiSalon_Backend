const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

require('dotenv').config();

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const indexRouter = require('./routes/index');
const uporabnikiRouter = require('./routes/uporabniki');
const frizerjiRouter = require('./routes/frizerji');
const storitveRouter = require('./routes/storitve');
const terminiRouter = require('./routes/termini');
const delovnikiRouter = require('./routes/delovniki');

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Swagger setup
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'frizerski_salon API',
      version: '1.0.0',
      description: 'API dokumentacija za projekt frizerski_salon',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: [path.join(__dirname, 'routes', '*.js')] // tukaj bodo routi z JSDoc komentarji
};

const specs = swaggerJsdoc(options);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

app.use('/', indexRouter);
app.use('/uporabniki', uporabnikiRouter);
app.use('/frizerji', frizerjiRouter);
app.use('/storitve', storitveRouter);
app.use('/termini', terminiRouter);
app.use('/delovniki', delovnikiRouter);

// 404 – route does not exist
app.use((req, res, next) => {
    next(createError(404, "Route not found"));
});

// central error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;

  console.error(err);

  res.status(status).json({
    error: status === 500
      ? "Napaka na strežniku"
      : err.message
  });
});

module.exports = app;
