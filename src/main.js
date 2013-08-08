var chem = require("chem");
var Game = require("./game").Game;

var canvas = document.getElementById("game");
var engine = new chem.Engine(canvas);
engine.start();
canvas.focus();
engine.showLoadProgressBar();
chem.resources.on('ready', function() {
  var game = new Game(engine);
  game.start();
});
