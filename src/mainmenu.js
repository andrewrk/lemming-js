var chem = require('chem');
var Vec2d = chem.vec2d.Vec2d;
var euclideanMod = require('./euclidean_mod');

exports.MainMenu = MainMenu;
function MainMenu(game) {
  this.game = game;
  this.arrow_positions = [
    [new Vec2d(149, 480-224), this.handleNewGame.bind(this)],
    [new Vec2d(154, 480-125), this.handleContinue.bind(this)],
  ];
  this.arrow_position = 0;
  this.title_pos = new Vec2d(46, 480-364);
  this.lem_pos = new Vec2d(506, 480-0);
}

MainMenu.prototype.start = function() {
  // batches
  this.batch = new chem.Batch();

  // groups
  var group_bg = 0;
  var group_fg = 1;

  // position sprites
  var sprite_bg = new chem.Sprite('title/bg', {
    batch: this.batch,
    pos: new Vec2d(0, 0),
    zOrder: group_bg,
  });
  var sprite_title = new chem.Sprite('title/title', {
    batch: this.batch,
    pos: this.title_pos,
    zOrder: group_fg,
  });
  var sprite_new_game = new chem.Sprite('title/new_game', {
    batch: this.batch,
    pos: this.arrow_positions[0][0],
    zOrder: group_fg,
  });
  var sprite_continue = new chem.Sprite('title/continue', {
    batch: this.batch,
    pos: this.arrow_positions[1][0],
    zOrder: group_fg,
  });
  this.sprite_arrow = new chem.Sprite('title/arrow', {
    batch: this.batch,
    pos: new Vec2d(0, 0),
    zOrder: group_fg,
  });
  var sprite_lem = new chem.Sprite('title/lem', {
    batch: this.batch,
    pos: this.lem_pos,
    zOrder: group_fg,
  });

  // play bg music
  this.bg_music = new Audio('music/depressing.mp3');
  this.bg_music.loop = true;
  this.bg_music.volume = 0.50;
  this.bg_music.play();

  // set up handlers
  this.game.engine.on('draw', this.on_draw.bind(this));
  this.game.engine.on('buttondown', this.on_key_press.bind(this));
  this.game.engine.on('update', this.update.bind(this));
};

MainMenu.prototype.clear = function() {
  this.game.engine.removeAllListeners();
  this.bg_music.pause();
  this.bg_music.src = "";
  this.bg_music = null;
};

MainMenu.prototype.handleNewGame = function() {
  this.game.startPlaying();
};

MainMenu.prototype.handleContinue = function() {
  this.game.load();
  this.game.startPlaying();
};

MainMenu.prototype.on_draw = function(context) {
  this.batch.draw(context);
};

MainMenu.prototype.update = function(dt, dx) {
  this.sprite_arrow.pos = this.arrow_positions[this.arrow_position][0].offset(-44, 0);
};

MainMenu.prototype.on_key_press = function(button) {
  switch (button) {
    case chem.button.KeyUp:
      this.arrow_position = euclideanMod(this.arrow_position - 1, 2);
      break;
    case chem.button.KeyDown:
      this.arrow_position = euclideanMod(this.arrow_position + 1, 2);
      break;
    case chem.button.KeySpace:
    case chem.button.KeyEnter:
      this.arrow_positions[this.arrow_position][1]();
      break;

  }
};
