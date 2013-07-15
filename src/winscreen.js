var chem = require('chem');

exports.WinScreen = WinScreen;

function WinScreen(game) {
  this.game = game;
}

WinScreen.prototype.start = function() {
  this.img_bg = chem.resources.getImage('credits/bg');
  this.bg_music = new Audio("music/glitch.mp3");
  this.bg_music.volume = 0.50;
  this.bg_music.loop = true;
  this.bg_music.play();

  this.game.engine.on('draw', this.on_draw.bind(this));
};

WinScreen.prototype.clear = function() {
  this.game.engine.removeAllListeners();
  this.bg_music.pause();
  this.bg_music = null;
};

WinScreen.prototype.on_draw = function(context) {
  context.drawImage(this.img_bg, 0, 0);
};
