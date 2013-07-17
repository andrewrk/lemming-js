var TileSet = require('./tiles').TileSet;
var chem = require('chem');
var Vec2d = chem.vec2d.Vec2d;
var util = require('util');
var modulus = require('./euclidean_mod');

function sign(n) {
  if (n > 0) {
    return 1;
  } else if (n < 0) {
    return -1;
  } else {
    return 0;
  }
}

function abs_min(a, b) {
  if (Math.abs(a) < Math.abs(b)) {
    return a;
  }
  return b;
}

var tile_size = null;
var LEMMING_COUNT = 9;
var LEMMING_RESPONSE_TIME = 0.40;
var TARGET_FPS = 60;

var Control = {
  MoveLeft: 0,
  MoveRight: 1,
  MoveUp: 2,
  MoveDown: 3,
  BellyFlop: 4,
  Freeze: 5,
  Explode: 6,
};

function LemmingFrame(pos, vel, next_node, new_image, on_ladder) {
  this.pos = pos;
  this.vel = vel;
  this.on_ladder = !!on_ladder;
  this.next_node = next_node;
  this.prev_node = null;
  this.new_image = new_image;

  if (this.next_node != null) {
    this.next_node.prev_node = this;
  }
}

function PhysicsObject(pos, vel, sprite, size, life, can_pick_up_stuff,
    is_belly_flop, direction)
{
  this.pos = pos;
  this.vel = vel;
  this.sprite = sprite;
  this.size = size; // in tiles
  this.life = life;
  this.gone = false;
  this.can_pick_up_stuff = !!can_pick_up_stuff;
  this.is_belly_flop = !!is_belly_flop;
  this.direction = direction == null ? 1 : direction;
  this.explodable = false;
  this.on_ladder = false;
}

PhysicsObject.prototype.delete = function() {
  this.gone = true;
  if (this.sprite != null) {
    this.sprite.delete();
    this.sprite = null;
  }
};

PhysicsObject.prototype.think = function(dt) {
  // override this method
};

function Lemming(sprite, frame) {
  if (frame != null) {
    PhysicsObject.call(this, frame.pos, frame.vel, sprite, new Vec2d(1, 4), undefined, true);
  } else {
    PhysicsObject.call(this, null, null, sprite, new Vec2d(1, 4), undefined, true);
  }
  this.frame = frame;
  this.gone = false;
}
util.inherits(Lemming, PhysicsObject);

function Tank(pos, size, sprite, game, dir_lock) {
  PhysicsObject.call(this, pos, new Vec2d(0, 0), sprite, size);

  this.game = game;
  this.explodable = true;
  this.can_shoot = true;
  this.shoot_delay = 2;
  this.dir_lock = !!dir_lock;
}

Tank.prototype.think = function(dt) {
  if (this.game.control_lemming >= this.game.lemmings.length) return;

  var player_pos = this.game.lemmings[this.game.control_lemming].pos.divBy(tile_size).floor();
  var my_pos = this.pos.divBy(tile_size).floor();
  var look_direction = sign(player_pos.x - my_pos.x);
  if (this.dir_lock != null) look_direction = this.dir_lock;
  this.changeDirection(look_direction);
  this.wantToShoot();
};

Tank.prototype.changeDirection = function(new_dir) {
  if (new_dir === this.direction) return;
  this.direction = new_dir;
  // TODO: instead of using a minus sign for flipped animations,
  // just flip the sprite.
  var name;
  if (this.direction < 0) {
    name = '-tank_point';
  } else if (this.direction > 0) {
    name = 'tank_point';
  } else {
    return;
  }
  this.sprite.setAnimationName(name);
};

Tank.prototype.wantToShoot = function() {
  var self = this;
  if (! self.can_shoot) return;
  self.can_shoot = false;
  setTimeout(recharge, self.shoot_delay * 1000);

  var gun_offset = new Vec2d(28*self.direction, 32);
  var bullet_init_vel = new Vec2d(350*self.direction, 300);
  self.game.spawnBomb(self.pos.plus(gun_offset), self.vel.plus(bullet_init_vel), 1);

  // TODO minus thing :-/
  var name;
  if (self.direction < 0) {
    name = '-tank_shoot';
  } else if (self.direction > 0) {
    name = 'tank_shoot';
  } else {
    return;
  }
  self.sprite.setAnimationName(name);

  function recharge() {
    self.can_shoot = true;
  }
};

function Gunner(pos, size, group, batch, game) {
  var sprite = new chem.Sprite("gunner_still", {
    pos: pos.clone(),
    zOrder: group,
    batch: batch,
  });
  PhysicsObject.call(this, pos, new Vec2d(0, 0), sprite, size, undefined,
      undefined, undefined, 0);

}
util.inherits(Gunner, PhysicsObject);

Gunner.prototype.think = function(dt) {
  if (this.game.control_lemming >= this.game.lemmings.length) return;

  var player_pos = this.game.lemmings[this.game.control_lemming].pos.divBy(tile_size).floor();
  var player_size = this.game.lemmings[this.game.control_lemming].size;
  var my_pos = this.pos.divBy(tile_size).floor();

  // if we can trace a path to lem then look at him
  var see_distance = 30;
  var can_see = false;
  var look_direction = sign(player_pos.x - my_pos.x);
  var eye_y = this.size.y - 1;
  for (var x = 0; x < see_distance; x += 1) {
    var test_pos = new Vec2d(my_pos.x + x * look_direction, my_pos.y + eye_y);
    if (this.game.getBlockIsSolid(test_pos)) break;
    if (test_pos.x >= player_pos.x && test_pos.x < player_pos.x + player_size.x &&
        test_pos.y >= player_pos.y && test_pos.y < player_pos.y + player_size.y)
    {
      can_see = true;
      break;
    }
    if (can_see) {
      this.changeDirection(look_direction);
      this.wantToShoot();
    } else {
      this.changeDirection(0);
    }
  }
};

Gunner.prototype.wantToShoot = function() {
  var self = this;
  if (self.direction === 0) return;
  if (! self.can_shoot) return;
  self.can_shoot = false;
  setTimeout(recharge, self.shoot_delay * 1000);

  var gun_offset = new Vec2d(64*self.direction, 16);
  var bullet_init_vel = new Vec2d(1100*self.direction, 200);
  self.game.spawnBullet(self.pos.plus(gun_offset), self.vel.plus(bullet_init_vel));

  // TODO minus thing
  var name = self.direction < 0 ? '-gunner_shoot' : 'gunner_shoot';
  self.sprite.setAnimationName(name);

  function recharge() {
    self.can_shoot = true;
  }
};

Gunner.prototype.changeDirection = function(new_dir) {
  if (new_dir === this.direction) return;
  this.direction = new_dir;
  // TODO minus thing
  var name;
  if (this.direction < 0) {
    name = '-gunner_point';
  } else if (this.direction > 0) {
    name = 'gunner_point';
  } else {
    name = 'gunner_still';
  }
  this.sprite.setAnimationName(name);
};

function Bomb(pos, vel, fuse, sprite, game) {
  PhysicsObject.call(this, pos, vel, sprite, new Vec2d(1, 1));
  this.game = game;
  this.fuse = fuse;
}
util.inherits(Bomb, PhysicsObject);

Bomb.prototype.think = function(dt) {
  this.fuse -= dt;

  if (this.fuse <= 0) {
    this.game.handleExplosion(this.pos, this.vel);
    this.delete();
  }
};

function Bullet(pos, vel, sprite, game) {
  var max_bullet_life = 10;
  PhysicsObject.call(pos, vel, sprite, new Vec2d(1, 1), max_bullet_life);
  this.game = game;
  this.prev_pos = this.pos.clone();
}
util.inherits(Bullet, PhysicsObject);

Bullet.prototype.think = function(dt) {
  var old_prev_pos = this.prev_pos;
  this.prev_pos = new Vec2d(this.pos);

  // if we're going too slow, die
  var die_threshold = 100;
  if (Math.abs(this.vel.x) < die_threshold) {
    this.delete();
    return;
  }

  if (this.game.control_lemming >= this.game.lemmings.length) return;

  var player_pos = this.game.lemmings[this.game.control_lemming].pos.divBy(tile_size).floor();
  var player_size = this.game.lemmings[this.game.control_lemming].size;
  var vector_it = old_prev_pos.clone();
  var unit_vector_vel = this.vel.normalized();
  var last_one = false;
  while (! last_one) {
    vector_it.add(unit_vector_vel.scaled(tile_size));
    // if we hit something solid, die
    if (old_prev_pos.distanceSqrd(this.pos) < old_prev_pos.distanceSqrd(vector_it)) {
      last_one = true;
      vector_it = this.pos;
    }
    var my_block = vector_it.divBy(tile_size).floor();
    if (this.game.getBlockIsSolid(my_block)) {
      this.delete();
      return;
    }

    // test for hitting player
    if (my_block.x >= player_pos.x && my_block.x < player_pos.x + player_size.x &&
        my_block.y >= player_pos.y && my_block.y < player_pos.y + player_size.y)
    {
      this.game.hitByBullet();
      this.delete();
      return;
    }
  }
};

function Monster(pos, size, group, batch, game, direction, throw_vel) {
  // TODO - flip the sprite instead of using minus sign
  var negate = direction > 0 ? '' : '-';
  var sprite = new chem.Sprite(negate+'monster_still', {
    pos: pos.clone(),
    zOrder: group,
    batch: batch,
  });
  PhysicsObject.call(this, pos, new Vec2d(0, 0), sprite, size, undefined,
      undefined, undefined, direction);
  this.game = game;
  this.grabbing = false;
  this.explodable = true;
  if (throw_vel == null) {
    this.throw_vel = new Vec2d(600*direction, 600);
  } else {
    this.throw_vel = throw_vel;
  }
}
util.inherits(Monster, PhysicsObject);

Monster.prototype.think = function(dt) {
  if (this.game.control_lemming < this.game.lemmings.length) {
    var player_pos = this.game.lemmings[this.game.control_lemming].pos.divBy(tile_size).floor();
    var my_pos = this.pos.divBy(tile_size).floor();
    var get_him;
    if (this.direction > 0) {
      get_him = player_pos.x >= my_pos.x + 2 && player_pos.x <= my_pos.x+5;
    } else {
      get_him = player_pos.x <= my_pos.x + 2 && player_pos.x >= my_pos.x-3;
    }
    if (get_him && (player_pos.y === my_pos.y || player_pos.y === my_pos.y + 1) &&
        !this.grabbing)
    {
      this.grabbing = true;
      this.game.getGrabbedBy(this, this.throw_vel);
    }
  }
};

function PlatformObject() {}

PlatformObject.prototype.solidAt = function(block) {
  return false;
};

function ConveyorBelt(pos, size, sprite, game, state, direction) {
  this.pos = pos;
  this.size = size;
  this.sprite = sprite;
  this.game = game;
  this.state = state == null ? true : state === 'on';
  this.direction = sign(direction == null ? 1 : direction);
  // reversed because animation is backwards
  // TODO flip sprite instead of minus thing
  this.animations = {
    '-1': 'belt_on',
    '1': '-belt_on',
  };
  this.toggle();
  this.toggle();
}

ConveyorBelt.prototype.toggle = function() {
  this.state = !this.state;

  var new_tile;
  if (this.state) {
    // TODO minus thing
    this.sprite.setAnimationName(this.animations[this.direction]);
    this.setCorrectPosition();

    new_tile = this.direction > 0 ? this.game.tiles.enum.BeltRight : this.game.tiles.enum.BeltLeft;
  } else {
    this.sprite.setAnimationName('belt_off');
    this.setCorrectPosition();
    new_tile = this.game.tiles.enum.SolidInvisible;
  }
  var it = new Vec2d(0, 0);
  for (it.x = 0; it.x < this.size.x; it.x += 1) {
    for (it.y = 0; it.y < this.size.y; it.y += 1) {
      this.game.setTile(this.pos.plus(it), new_tile);
    }
  }
};

ConveyorBelt.prototype.setCorrectPosition = function() {
  // TODO double check this - it relies on animation offset
  this.sprite.pos = this.pos.times(tile_size).plus(this.game.animation_offset[this.sprite.animationName]);
};

function Bridge(pos, size, state, up_sprite, down_sprite) {
  PlatformObject.call(this);

  this.pos = pos;
  this.size = size;
  this.state_up = state === 'up';
  this.up_sprite = up_sprite;
  this.down_sprite = down_sprite;

  this.toggle();
  this.toggle();
}
util.inherits(Bridge, PlatformObject);

Bridge.prototype.toggle = function() {
  this.state_up = ! this.state_up;
  this.up_sprite.visible = this.state_up;
  this.down_sprite.visible = !this.state_up;
};

Bridge.prototype.solidAt = function(pos) {
  var rel_pos = pos.minus(this.pos);
  if (this.state_up) {
    return rel_pos.x === this.size.x - 1 && rel_pos.y >= 0 && rel_pos.y < this.size.y;
  } else {
    return rel_pos.y === 0 && rel_pos.x >= 0 && rel_pos.x < this.size.x;
  }
};

function TrapDoor(pos, size, state, sprite, game) {
  this.pos = pos;
  this.size = size;
  this.state = state;
  this.sprite = sprite;
  this.game = game;

  this.toggle();
  this.toggle();
}

TrapDoor.prototype.toggle = function() {
  var new_tile;
  if (this.state === 'closed') {
    this.state = 'open';
    this.sprite.visible = false;
    new_tile = this.game.tiles.enum.Air;
  } else {
    this.state = 'closed';
    this.sprite.visible = true;
    new_tile = this.game.tiles.enum.SolidInvisible;
  }
  var it = new Vec2d(0, 0);
  for (it.x = 0; it.x < this.size.x; it.x +=1) {
    for (it.y = 0; it.y < this.size.y; it.y += 1) {
      this.game.setTile(this.pos.plus(it), new_tile);
    }
  }
};

TrapDoor.prototype.solidAt = function(pos) {
  var rel_pos = pos.minus(this.pos);
  if (this.state === 'open') {
    return false;
  } else {
    return rel_pos.y >= 0 && rel_pos.y < this.size.y &&
      rel_pos.x >= 0 && rel_pos.x < this.size.x;
  }
};

function Gear(pos, size, button_id, sprite, game) {
  this.pos = pos;
  this.size = size;
  this.button_id = button_id;
  this.sprite = sprite;
  this.game = game;
  this.turning = true;
}

Gear.prototype.hit = function(who_done_it) {
  if (! this.turning) return;
  this.turning = false;

  var is_char = false;
  if (this.game.control_lemming < this.game.lemmings.length) {
    // TODO this === check might not work; might have to use IDs
    is_char = this.game.lemmings[this.game.control_lemming] === who_done_it;
  }

  this.game.hitButtonId(this.button_id);
  this.sprite.setAnimationName('gear_bloody');
  this.game.playSoundAt('spike_death', who_done_it.pos);
  this.game.spawnGoreExplosion(who_done_it.pos, who_done_it.vel, who_done_it.size);

  if (is_char) {
    this.game.detach_queued = true;
  } else {
    who_done_it.delete();
  }
};

function Button(pos, button_id, up_sprite, down_sprite, delay, game) {
  this.pos = pos;
  this.button_id = button_id;
  this.up_sprite = up_sprite;
  this.down_sprite = down_sprite;
  this.delay = delay;
  this.game = game;
  this.changeState(false);
}

Button.prototype.hit = function(who_done_it) {
  var self = this;
  if (self.state_down) return;

  self.changeState(true);
  self.game.hitButtonId(self.button_id);
  self.game.playSoundAt('button_click', who_done_it.pos);

  setTimeout(goBackUp, this.delay * 1000);

  function goBackUp() {
    self.changeState(false);
    self.game.playSoundAt('button_unclick', who_done_it.pos);
  }
};

Button.prototype.changeState = function(value) {
  this.state_down = value;
  this.up_sprite.visible = !this.state_down;
  this.down_sprite.visible = this.state_down
};

function BombSpawner(pos, size, game, delay, state, fuse_min, fuse_max) {
  this.pos = pos;
  this.size = size;
  this.game = game;
  this.delay = delay;
  this.state = state == null ? true : state === 'on';
  this.fuse_min = fuse_min == null ? 1 : fuse_min;
  this.fuse_max = fuse_max == null ? 4 : fuse_max;

  this.toggle();
  this.toggle();
}

BombSpawner.prototype.toggle = function() {
  this.state = !this.state;

  // TODO: make it so that game.clear() cleans this up
  if (this.state) {
    this.interval = setInterval(this.spawn.bind(this), this.delay * 1000);
  } else {
    clearInterval(this.interval);
    this.interval = null;
  }
};

BombSpawner.prototype.spawn = function() {
  // pick a random location within my size
  var pos = this.pos.offset(Math.random() * this.size.x, Math.random() * this.size.y);

  // pick random fuse length
  var fuse = this.fuse_min + Math.random() * (this.fuse_min - this.fuse_max);

  // vary the velocity by tiny amounts
  var vel = new Vec2d(Math.random() * 100 - 50, Math.random() * 100 - 50);

  this.game.spawnBomb(pos, vel, fuse);
};

function LevelPlayer(game, level_fd) {
  this.game = game;
  this.level = null;
  this.physical_objects = [];
  this.button_responders = {};
  this.platform_objects = [];
  this.buttons = {};
  this.victory = {};
  this.intervals = [];

  this.batch_bg2 = new chem.Batch();
  this.batch_bg1 = new chem.Batch();
  this.batch_level = new chem.Batch();
  this.batch_static = new chem.Batch();

  // TODO loop the bg music

  this.loadConfig();
  this.level_fd = level_fd;
}

LevelPlayer.prototype.getNextGroupNum = function() {
  var val = this.next_group_num;
  this.next_group_num += 1;
  return val;
};

LevelPlayer.prototype.loadSoundEffects = function() {
  this.sfx = {
    'blast': new chem.Sound('sfx/blast.mp3'),
    'button_click': new chem.Sound('sfx/button_click.mp3'),
    'button_unclick': new chem.Sound('sfx/button_unclick.mp3'),
    'coin_pickup': new chem.Sound('sfx/coin_pickup.mp3'),
    'game_over': new chem.Sound('sfx/game_over.mp3'),
    'gunshot': new chem.Sound('sfx/gunshot.mp3'),
    'jump': new chem.Sound('sfx/jump.mp3'),
    'level_start': new chem.Sound('sfx/level_start.mp3'),
    'mine_beep': new chem.Sound('sfx/mine_beep.mp3'),
    'spike_death': new chem.Sound('sfx/spike_death.mp3'),
    'weee': new chem.Sound('sfx/weee.mp3'),
    'winnar': new chem.Sound('sfx/winnar.mp3'),
    'woopee': new chem.Sound('sfx/woopee.mp3'),
  };
  this.ladder_audio = new Audio('sfx/ladder.mp3');
  this.running_audio = new Audio('sfx/running.mp3');
  this.current_running_audio = null;
};

LevelPlayer.prototype.stopRunningSound = function() {
  if (this.current_running_audio != null) this.current_running_audio.pause();
};

LevelPlayer.prototype.setRunningSound = function(source) {
  this.stopRunningSound();
  if (source == null) return;
  this.current_running_audio = source;
  this.current_running_audio.loop = true;
  this.current_running_audio.play();
};

LevelPlayer.prototype.loadImages = function() {
  // TODO: generate the minus animations?

  this.img_hud = chem.resources.getImage('hud');
  this.img_gore = [
    'gore1',
    'gore2',
    'gore3',
  ];

  var name;
  if (this.level.properties.bg_art) {
    name = this.level.properties.bg_art;
    this.sprite_bg_left = new chem.Sprite(name, { batch: this.batch_bg2 });
    this.sprite_bg_right = new chem.Sprite(name, { batch: this.batch_bg2});
    this.sprite_bg_left.pos = new Vec2d(0, 0);
    this.sprite_bg_right.pos = new Vec2d(this.sprite_bg_left.size.x, 0);
  } else {
    console.log("map is missing 'bg_art' property");
    this.sprite_bg_left = null;
    this.sprite_bg_right = null;
  }

  if (this.level.properties.fg_art) {
    name = this.level.properties.fg_art;
    this.sprite_bg2_left = new chem.Sprite(name, {batch: this.batch_bg1});
    this.sprite_bg2_right = new chem.Sprite(name, {batch: this.batch_bg1});
    this.sprite_bg2_left.pos = new Vec2d(0, 0);
    this.sprite_bg2_right.pos = new Vec2d(this.sprite_bg2_left.size.x, 0);
  } else {
    console.log("map is missing 'fg_art' property");
    this.sprite_bg2_left = null;
    this.sprite_bg2_right = null;
  }

  this.label_mans = new chem.Label('9', {
    font: "18pt Arial",
    pos: new Vec2d(150, 0),
    batch: this.batch_static,
    fillStyle: "#000000",
    textAlign: 'left',
    textBaseline: 'top',
  });
};

LevelPlayer.prototype.loadConfig = function() {
  this.controls = {};
  this.controls[Control.MoveLeft] = chem.button.KeyLeft;
  this.controls[Control.MoveRight] = chem.button.KeyRight;
  this.controls[Control.MoveUp] = chem.button.KeyUp;
  this.controls[Control.MoveDown] = chem.button.KeyDown;
  this.controls[Control.BellyFlop] = chem.button.Key1;
  this.controls[Control.Explode] = chem.button.Key2;
  this.controls[Control.Freeze] = chem.button.Key3;
};

LevelPlayer.prototype.getDesiredScroll = function(point) {
  var scroll = point.minus(this.game.engine.size.scaled(0.5))
  if (scroll.x < 0) scroll.x = 0;
  if (scroll.y < 0) scroll.y = 0;
  var maxRight = this.level.width * this.level.tilewidth - this.game.engine.size.x;
  if (scroll.x > maxRight) scroll.x = maxRight;
  var maxDown = this.level.height * this.level.tileheight - this.game.engine.size.y;
  if (scroll.y > maxDown) scroll.y = maxDown;
  return scroll;
};

LevelPlayer.prototype.clear = function() {
  this.game.engine.removeAllListeners();
  for (var i = 0; i < this.intervals.length; i += 1) {
    clearInterval(this.intervals[i]);
  }
  this.intervals = null;

  this.bg_music.pause();
  this.bg_music = null;

  this.lemmings = null;

  this.level = null;
  this.physical_objects = null;
  this.button_responders = null;
  this.platform_objects = null;
  this.buttons = null;
  this.victory = null;

  this.batch_bg2 = null;
  this.batch_bg1 = null;
  this.batch_level = null;
  this.batch_static = null;

  this.stopRunningSound();
};

LevelPlayer.prototype.start = function() {
  this.load();

  this.game.engine.on('draw', this.on_draw.bind(this));

  this.scroll = this.getDesiredScroll(this.start_point);
  this.scroll_vel = new Vec2d(0, 0);
  this.last_scroll_delta = new Vec2d(0, 0);
  this.lemmings = new Array(LEMMING_COUNT);
  this.control_lemming = 0;
  this.held_by = null;
  this.handled_victory = false;

  this.explode_queued = false; // true when the user presses the button util an update happens
  this.bellyflop_queued = false;
  this.freeze_queued = false;
  this.plus_ones_queued = 0;
  this.detach_queued = false;

  // resets variables based on level and begins the game
  // generate data for each lemming
  for (var i = 0; i < this.lemmings.length; i += 1) {
    var sprite = new chem.Sprite('lem_crazy', {
      batch: this.batch_level,
      zOrder: this.group_char,
    })
    if (i > 0) sprite.alpha = 0.50;
    this.lemmings[i] = new Lemming(sprite, null);
  }

  // generate frames for trails
  var head_frame = new LemmingFrame(this.start_point.clone(), new Vec2d(0, 0));
  var lemming_index = this.lemmings.length - 1;
  this.lemmings[lemming_index].frame = head_frame;
  lemming_index -= 1;
  var lemming_frame_count = 1;
  while (TARGET_FPS * LEMMING_RESPONSE_TIME * (this.lemmings.length-1) > lemming_frame_count) {
    head_frame = new LemmingFrame(head_frame.pos.clone(), head_frame.vel.clone(), head_frame);
    lemming_frame_count += 1;
    if (Math.floor((this.lemmings.length - 1 - lemming_index) *
          TARGET_FPS * LEMMING_RESPONSE_TIME) === lemming_frame_count)
    {
      this.lemmings[lemming_index].frame = head_frame;
      lemming_index -= 1;
    }
  }

  this.game.engine.on('update', this.update.bind(this));

  this.intervals.push(setInterval(this.garbage_collect.bind(this), 10000));
  this.fps_display = this.game.engine.createFpsLabel();

  this.sfx.level_start.play();

  this.sprite_hud = new chem.Sprite('hud', {
    batch: this.batch_static,
    pos: new Vec2d(0, 0),
  });
};

LevelPlayer.prototype.getGrabbedBy = function(monster, throw_vel) {
  var self = this;
  self.lemmings[self.control_lemming].frame.vel = new Vec2d(0, 0);
  self.lemmings[self.control_lemming].sprite.visible = false;
  self.held_by = monster;

  // hide sprite until throw animation is over
  // TODO: minus thing
  var negate = "";
  if (monster.direction < 0) negate = '-';
  monster.sprite.setAnimationName(negate+"monster_throw");
  monster.sprite.once('animationend', reset_animation);

  function reset_animation() {
    monster.sprite.setAnimationName(negate+"monster_still");
    self.lemmings[self.control_lemming].frame.vel = monster.vel.plus(throw_vel);
    self.lemmings[self.control_lemming].frame.pos = new Vec2d(
        monster.pos.x + (1+monster.direction)*self.level.tilewidth,
        monster.pos.y);
    self.lemmings[self.control_lemming].sprite.visible = true;
    self.held_by = null;
    setTimeout(not_grabbing, 2000);
    self.sfx[['weee', 'woopee'][Math.floor(Math.random() * 2)]].play();
    function not_grabbing() {
      monster.grabbing = false;
    }
  }
};

LevelPlayer.prototype.detachHeadLemming = function() {
  var head_lemming = this.lemmings[this.control_lemming];

  head_lemming.sprite.delete();
  head_lemming.sprite = null;

  this.control_lemming += 1;
  if (this.control_lemming === this.lemmings.length) {
    // game over
    this.handleGameOver();
    return;
  }
  head_lemming = this.lemmings[this.control_lemming];

  head_lemming.sprite.alpha = 1;
  head_lemming.frame.prev_node = null;
};

LevelPlayer.prototype.handleExplosion = function(pos, vel, caused_by_self) {
  this.playSoundAt('blast', pos);
  var sprite = new chem.Sprite('explosion', {
    batch: this.batch_level,
    zOrder: this.group_fg,
  });
  debugger; // check if animations.explosion.duration worked below
  this.physical_objects.push(new PhysicsObject(pos, vel, sprite, new Vec2d(1, 1),
        chem.resources.animations.explosion.duration));
  var explosion_power = 4;

  // break blocks
  var it = new Vec2d(0, 0);
  var block_pos = pos.divBy(tile_size).floor();
  for (it.y = 0; it.y < explosion_power * 2; it.y += 1) {
    for (it.x = 0; it.x < explosion_power * 2; it.x += 1) {
      var pt = block_pos.plus(it).offset(-explosion_power, -explosion_power);
      if (pt.distance(block_pos) <= explosion_power) {
        // affect block
        var tile = this.getTile(pt);
        if (tile.breakable) this.setTile(pt, this.tiles.enum.Air);
      }
    }
  }

  // see if we need to blow up any monsters
  this.physical_objects.forEach(blowUpObj);
  if (this.control_lemming < this.lemmings.length && ! caused_by_self) {
    blowUpObj(this.lemmings[this.control_lemming]);
  }
  var self = this;
  function blowUpObj(obj) {
    if (obj.gone) return;
    var obj_center = obj.size.times(tile_size).scale(0.5).plus(obj.pos);
    var distance = obj_center.distance(pos);
    // TODO tilewidth
    if (distance < explosion_power * self.level.tilewidth) {
      if (obj.explodable) {
        // kill monster
        obj.delete();
      } else {
        // propel object by the explosion
        var direction = obj_center.minus(pos);
        var propel_factor = 20;
        obj.vel.add(direction.scaled(propel_factor));
        obj.on_ladder = false;
      }
    }
  }
};

LevelPlayer.prototype.handleGameOver = function() {
  var self = this;

  self.bg_music.pause();
  self.sfx.game_over.play();

  setTimeout(restart, 4000);

  function restart() {
    self.game.restartLevel();
  }
};

LevelPlayer.prototype.handleVictory = function() {
  var self = this;

  self.bg_music.pause();
  self.sfx.winnar.play();

  setTimeout(goNext, 4000);

  function goNext() {
    self.game.gotoNextLevel();
  }
};

LevelPlayer.prototype.update = function(dt, dx) {
  if (this.game.engine.buttonJustPressed(this.controls[Control.Explode])) {
    this.explode_queued = true;
  }
  if (this.game.engine.buttonJustPressed(this.controls[Control.BellyFlop])) {
    if (this.held_by != null) {
      this.bellyflop_queued = true;
    } else {
      var char = this.lemmings[this.control_lemming];
      // TODO: wtf is level.tilewidth
      var pos_at_feet = new Vec2d(char.frame.pos.x + this.level.tilewidth / 2, char.frame.pos.y - 1);
      var block_at_feet = pos_at_feet.divBy(tile_size).floor();
      var on_ground = this.getBlockIsSolid(block_at_feet);

      if (! on_ground) this.bellyflop_queued = true;
    }
  }
  if (this.game.engine.buttonJustPressed(this.controls[Control.Freeze])) {
    this.freeze_queued = true;
  }
  // TODO: port this function
};

LevelPlayer.prototype.on_draw = function(context) {
  // far background
  var far_bgpos = new Vec2d(
      -modulus(this.scroll.x * 0.25, this.sprite_bg_left.width),
      -(this.scroll.y * 0.10));
  // TODO: these y coords are fucked
  if (far_bgpos.y > 0) far_bgpos.y = 0;
  if (far_bgpos.y + this.sprite_bg_left.size.y < this.game.engine.size.y) {
    far_bgpos.y = this.game.engine.size.y - this.sprite_bg_left.size.y;
  }
  far_bgpos.floor();

  context.setTransform(1, 0, 0, 1, 0, 0); // load identity
  context.translate(far_bgpos.x, far_bgpos.y);
  this.batch_bg2.draw(context);

  // close background
  var close_bgpos = new Vec2d(
      -modulus(this.scroll.x * 0.5, this.sprite_bg2_left.width),
      -(this.scroll.y * 0.20));
  // TODO: these y coords are also fucked
  if (close_bgpos.y > 0) close_bgpos.y = 0;
  close_bgpos.floor();
  context.setTransform(1, 0, 0, 1, 0, 0); // load identity
  context.translate(close_bgpos.x, close_bgpos.y);
  this.batch_bg1.draw(context);

  // level
  var floored_scroll = this.scroll.floored().scale(-1);
  context.setTransform(1, 0, 0, 1, 0, 0); // load identity
  context.translate(floored_scroll.x, floored_scroll.y);
  this.batch_level.draw(context);

  // hud
  context.setTransform(1, 0, 0, 1, 0, 0); // load identity
  this.batch_static.draw(context);
  this.fps_display.draw(context);
};

LevelPlayer.prototype.blockAt = function(abs_pt) {
  return abs_pt.divBy(tile_size).floor();
};

LevelPlayer.prototype.getTile = function(block_pos, layer_index) {
  var tile = null;
  try {
    debugger; // make sure that crazy lookup will work
    tile = this.tiles.info[this.level.layers[layer_index].content2D[block_pos.x][block_pos.y]];
  } catch (err) {}
  if (tile) return tile;
  return this.tiles.info[this.tiles.enum.Air];
};

LevelPlayer.prototype.getBlockIsSolid = function(block_pos) {
  var tile_there = this.getTile(block_pos);
  if (tile_there.solid) return true;

  // check if there is an object filling this role
  for (var i = 0; i < this.platform_objects.length; i += 1) {
    var platform = this.platform_objects[i];
    if (platform.solidAt(block_pos)) return true;
  }
  return false;
};

LevelPlayer.prototype.setTile = function(block_pos, tile_Id) {
  // TODO: port this function
};

LevelPlayer.prototype.garbage_collect = function(dt) {
  if (this.physical_objects == null) return;
  this.physical_objects = this.physical_objects.filter(notGone);
  function notGone(obj) {
    return !obj.gone;
  }
};

LevelPlayer.prototype.hitButtonId = function(button_id) {
  var responders = this.button_responders[button_id];
  if (!responders) return;
  responders.forEach(function(responder) {
    responder.toggle();
  });
};

LevelPlayer.prototype.load = function() {
  // TODO: port this function
};

LevelPlayer.prototype.isVictory = function(block) {
  return !!this.victory[block.toString()];
};

LevelPlayer.prototype.spawnBullet = function(pos, vel) {
  var sprite = new chem.Sprite('bullet', {
    pos: pos.clone(),
    batch: this.batch_level,
    zOrder: this.group_fg,
  });
  var bullet = new Bullet(pos, vel, sprite, this);
  this.physical_objects.push(bullet);
  this.playSoundAt('gunshot', pos);
};

LevelPlayer.prototype.hitByBullet = function() {
  var char = this.lemmings[this.control_lemming];
  if (!char) return;

  this.detach_queued = true;
  debugger; // make sure char.size works
  this.spawnGoreExplosion(char.pos, char.vel, char.size);
};

LevelPlayer.prototype.spawnBomb = function(pos, vel, fuse) {
  var sprite = new chem.Sprite('bomb', {
    pos: pos.clone(),
    batch: this.batch_level,
    zOrder: this.group_fg,
  });
  var bomb = new Bomb(pos, vel, fuse, sprite, this);
  this.physical_objects.push(bomb);
};

LevelPlayer.prototype.playSoundAt = function(sfx_name, pos) {
  var audio = this.sfx[sfx_name].play();
  var zero_volume_distance_sqrd = 640000;
  debugger; // double check dat math
  audio.volume = 1 - pos.distanceSqrd(this.scroll.plus(this.game.engine.size.scaled(0.5))) / zero_volume_distance_sqrd;
  return audio;
};

LevelPlayer.prototype.spawnGoreExplosion = function(pos, vel, size) {
  // how many to spawn
  var amt = Math.floor(Math.random() * 20 + 10);

  var vel_variability = new Vec2d(300, 200);
  var center_vel = new Vec2d(0, 300);
  for (var i = 0; i < amt; i += 1) {
    // pick a random position
    var this_pos = pos.offset(
        Math.random() * size.x * this.level.tilewidth,
        Math.random() * size.y * this.level.tileheight);
    // pick velocity
    var this_vel = center_vel.offset(
        Math.random() * vel_variability.x - vel_variability.x / 2,
        Math.random() * vel_variability.y - vel_variability.y / 2);
    // pick graphic
    var this_graphic = this.img_gore[Math.floor(Math.random() * this.img_gore.length)];

    var sprite = new chem.Sprite(this_graphic, {
      pos: this_pos.clone(),
      zOrder: this.group_fg,
      batch: this.batch_level,
    });
    var obj = new PhysicsObject(this_pos, this_vel, sprite, new Vec2d(1, 1), 10);
    this.physical_objects.push(obj);
  }
};
