var chem = require("chem");
var Game = require("./game").Game;

chem.onReady(function () {
  var canvas = document.getElementById("game");
  var engine = new chem.Engine(canvas);
  var game = new Game(engine);
  canvas.focus();
  game.start();
});
