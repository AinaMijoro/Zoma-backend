require("./models/connection");

var express = require("express");


var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var activitiesRouter = require("./routes/activities");
var ordersRouter = require("./routes/orders");
var conversationsRouter = require("./routes/conversations");

var app = express();
const cors = require("cors");
app.use(cors());

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/activities", activitiesRouter);
app.use("/products", require("./routes/products"));
app.use("/favorites", require("./routes/favorites"));
app.use("/orders", ordersRouter);
app.use("/conversations", conversationsRouter);
module.exports = app;
