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

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
