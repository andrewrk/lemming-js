var chem = require('chem');
var mainmenu = require('./mainmenu');
var levelplayer = require('./levelplayer');
var winscreen = require('./winscreen');

var levels = [
  "level1.tmx",
  "level2.tmx",
  "level3.tmx",
  "level4.tmx",
  "level5.tmx",
  "level6.tmx",
  "level7.tmx",
  "level8.tmx",
  "level9.tmx",
];

exports.Game = Game;

function Game(engine) {
  this.engine = engine;
  this.current_level = 0;
  this.current_screen = null;
  this.window = null;
  this.width = engine.size.x;
  this.height = engine.size.y;
}

Game.prototype.load = function() {
  var levelStr = localStorage.getItem('save_game');
  var level = parseInt(levelStr, 10);
  if (level >= 0) {
    this.current_level = level;
  } else {
    this.current_level = 0;
  }
};

Game.prototype.save = function() {
  localStorage.setItem('save_game', this.current_level.toString());
};

Game.prototype.gotoNextLevel = function() {
  if (this.level_filename != null) {
    this.startPlaying();
    return;
  }

  this.clearCurrentScreen();
  this.current_level += 1;
  this.save();
  this.setScreenToCurrentLevel();
  this.current_screen.start();
};

Game.prototype.setScreenToCurrentLevel = function() {
  if (this.current_level >= levels.length) {
    this.current_screen = new winscreen.WinScreen(this);
  } else {
    this.current_screen = new levelplayer.LevelPlayer(this, levels[this.current_level]);
  }
};

Game.prototype.startPlaying = function() {
  this.clearCurrentScreen();
  if (this.level_filename == null) {
    this.setScreenToCurrentLevel();
  } else {
    this.current_screen = new levelplayer.LevelPlayer(this, this.level_filename);
  }
  this.current_screen.start();
};

Game.prototype.start = function(level_filename) {
  var self = this;

  self.level_filename = level_filename;
  if (self.level_filename == null) {
    self.current_screen = new mainmenu.MainMenu(this);
  } else {
    self.current_screen = new levelplayer.LevelPlayer(this, level_filename);
  }
  self.current_screen.start();
};

Game.prototype.clearCurrentScreen = function() {
  if (this.current_screen != null) this.current_screen.clear();
};

Game.prototype.restartLevel = function() {
  this.startPlaying();
};
