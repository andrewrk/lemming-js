var chem = require('chem');
var Vec2d = chem.vec2d.Vec2d;
var ani = chem.resources.animations;
var util = require('util');
var modulus = require('./euclidean_mod');
var tmx = require('chem-tmx');

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
  this.sprite.setAnimation(ani[name]);
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
  self.sprite.setAnimation(ani[name]);

  function recharge() {
    self.can_shoot = true;
  }
};

function Gunner(pos, size, group, batch, game) {
  var sprite = new chem.Sprite(ani.gunner_still, {
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
  self.sprite.setAnimation(ani[name]);

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
  this.sprite.setAnimation(ani[name]);
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
  var sprite = new chem.Sprite(ani[negate+'monster_still'], {
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
    '-1': ani['belt_on'],
    '1': ani['-belt_on'],
  };
  this.toggle();
  this.toggle();
}

ConveyorBelt.prototype.toggle = function() {
  this.state = !this.state;

  var new_tile;
  if (this.state) {
    // TODO minus thing
    this.sprite.setAnimation(this.animations[this.direction]);
    this.setCorrectPosition();

    new_tile = this.direction > 0 ? this.game.tilesEnum.BeltRight : this.game.tilesEnum.BeltLeft;
  } else {
    this.sprite.setAnimation(ani.belt_off);
    this.setCorrectPosition();
    new_tile = this.game.tilesEnum.SolidInvisible;
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
    new_tile = this.game.tilesEnum.Air;
  } else {
    this.state = 'closed';
    this.sprite.visible = true;
    new_tile = this.game.tilesEnum.SolidInvisible;
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
    is_char = this.game.lemmings[this.game.control_lemming] === who_done_it;
  }

  this.game.hitButtonId(this.button_id);
  this.sprite.setAnimation(ani.gear_bloody);
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

  // TODO: replace getImage with chem.resources.images
  this.img_hud = chem.resources.getImage('hud');
  this.img_gore = [
    ani.gore1,
    ani.gore2,
    ani.gore3,
  ];

  var name;
  if (this.level.properties.bg_art) {
    name = this.level.properties.bg_art;
    this.sprite_bg_left = new chem.Sprite(ani[name], { batch: this.batch_bg2 });
    this.sprite_bg_right = new chem.Sprite(ani[name], { batch: this.batch_bg2});
    this.sprite_bg_left.pos = new Vec2d(0, 0);
    this.sprite_bg_right.pos = new Vec2d(this.sprite_bg_left.size.x, 0);
  } else {
    console.log("map is missing 'bg_art' property");
    this.sprite_bg_left = null;
    this.sprite_bg_right = null;
  }

  if (this.level.properties.fg_art) {
    name = this.level.properties.fg_art;
    this.sprite_bg2_left = new chem.Sprite(ani[name], {batch: this.batch_bg1});
    this.sprite_bg2_right = new chem.Sprite(ani[name], {batch: this.batch_bg1});
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
  var maxRight = this.level.width * this.level.tileWidth - this.game.engine.size.x;
  if (scroll.x > maxRight) scroll.x = maxRight;
  var maxDown = this.level.height * this.level.tileHeight - this.game.engine.size.y;
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
  this.load(this.afterLoad.bind(this));
};

LevelPlayer.prototype.afterLoad = function() {
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
    var sprite = new chem.Sprite(ani.lem_crazy, {
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

  this.sprite_hud = new chem.Sprite(ani.hud, {
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
  monster.sprite.setAnimation(ani[negate+"monster_throw"]);
  monster.sprite.once('animationend', reset_animation);

  function reset_animation() {
    monster.sprite.setAnimation(ani[negate+"monster_still"]);
    self.lemmings[self.control_lemming].frame.vel = monster.vel.plus(throw_vel);
    self.lemmings[self.control_lemming].frame.pos = new Vec2d(
        monster.pos.x + (1+monster.direction)*self.level.tileWidth,
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
  var sprite = new chem.Sprite(ani.explosion, {
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
        if (tile.breakable) this.setTile(pt, this.tilesEnum.Air);
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
    if (distance < explosion_power * self.level.tileWidth) {
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
  var self = this;
  var char;
  // handle control input
  if (self.game.engine.buttonJustPressed(self.controls[Control.Explode])) {
    self.explode_queued = true;
  }
  if (self.game.engine.buttonJustPressed(self.controls[Control.BellyFlop])) {
    if (self.held_by != null) {
      self.bellyflop_queued = true;
    } else {
      char = self.lemmings[self.control_lemming];
      var pos_at_feet = new Vec2d(char.frame.pos.x + self.level.tileWidth / 2, char.frame.pos.y - 1);
      var block_at_feet = pos_at_feet.divBy(tile_size).floor();
      var on_ground = self.getBlockIsSolid(block_at_feet);

      if (! on_ground) self.bellyflop_queued = true;
    }
  }
  if (self.game.engine.buttonJustPressed(self.controls[Control.Freeze])) {
    self.freeze_queued = true;
  }

  var sprite;
  var i;
  var lemming;
  self.label_mans.text = (self.lemmings.length - self.control_lemming).toString();
  var old_head_lemming;
  if (self.control_lemming < self.lemmings.length) {
    if (self.explode_queued) {
      self.explode_queued = false;

      if (self.held_by != null) {
        var explosion_pos = self.held_by.pos.plus(self.held_by.size.scaled(0.5).times(tile_size));
        self.handleExplosion(explosion_pos, self.held_by.vel, true);
      } else {
        old_head_lemming = self.lemmings[self.control_lemming];
        self.handleExplosion(old_head_lemming.frame.pos.offset(0, 2), old_head_lemming.frame.vel, true);
      }
      self.detachHeadLemming();
    } else if (self.detach_queued && self.held_by == null) {
      self.detach_queued = false;
      self.detachHeadLemming();
    } else if (self.bellyflop_queued && self.held_by == null) {
      self.bellyflop_queued = false;

      old_head_lemming = self.lemmings[self.control_lemming];
      var direction = sign(old_head_lemming.frame.vel.x);
      // TODO minus thing
      var animationName;
      if (direction < 0)  {
        animationName = '-lem_belly_flop';
      } else {
        direction = 1;
        animationName = 'lem_belly_flop';
      }

      // if it would be in the wall, move it out
      var size = new Vec2d(3, 1);
      var shift = 0;
      var obj_pos = new Vec2d(old_head_lemming.frame.pos.x, old_head_lemming.frame.pos.y);
      sprite = new chem.Sprite(ani[animationName], {
        batch: self.batch_level,
        zOrder: self.group_fg,
      });
      var obj = new PhysicsObject(obj_pos, old_head_lemming.frame.vel, sprite,
          size, undefined, true, true, direction);
      // shift it left until not in wall
      while (inWall(self, obj, size)) {
        obj.pos.x -= self.level.tileWidth;
      }
      self.physical_objects.push(obj);
      self.detachHeadLemming();
      self.sfx[['weee', 'woopee'][Math.floor(Math.random() * 2)]].play();
    }
  }

  // add more lemmings
  while (self.plus_ones_queued > 0 && self.control_lemming > 0) {
    self.plus_ones_queued -= 1;
    self.control_lemming -= 1;
    for (i = self.control_lemming; i < self.lemmings.length - 1; i += 1) {
      self.lemmings[i] = self.lemmings[i + 1];
    }
    // add the missing frames
    var old_last_frame = self.lemmings[self.lemmings.length - 2].frame;
    sprite = new chem.Sprite(ani.lem_crazy, {
      batch: self.batch_level,
      zOrder: self.group_char,
    });
    var frame = new LemmingFrame(old_last_frame.pos.clone(), old_last_frame.vel.clone(), null, null, old_last_frame.on_ladder);
    var last_lem = new Lemming(sprite, frame);
    self.lemmings[self.lemmings.length - 1] = last_lem;
    last_lem.sprite.alpha = 0.5;
    var node = last_lem.frame;
    for (i = 0; i < Math.floor(TARGET_FPS * LEMMING_RESPONSE_TIME); i += 1) {
      node = new LemmingFrame(old_last_frame.pos.clone(), old_last_frame.vel.clone(), node, null, old_last_frame.on_ladder);
    }
    old_last_frame.next_node = node;
    node.prev_node = old_last_frame;
  }

  // lemming trails
  char = null;
  if (self.control_lemming < self.lemmings.length) {
    char = self.lemmings[self.control_lemming];
    char.frame = new LemmingFrame(char.frame.pos.clone(), char.frame.vel.clone(), char.frame, null, char.frame.on_ladder);

    for (i = self.control_lemming + 1; i < self.lemmings.length; i += 1) {
      lemming = self.lemmings[i];
      lemming.frame = lemming.frame.prev_node;
    }
    self.lemmings[self.lemmings.length - 1].frame.next_node = null;

    char.pos = char.frame.pos;
    char.vel = char.frame.vel;
    char.on_ladder = char.frame.on_ladder;
  }

  // scroll the level
  if (char != null) {
    var desired_scroll;
    if (self.held_by == null) {
      desired_scroll = self.getDesiredScroll(char.pos.clone());
    } else {
      desired_scroll = self.getDesiredScroll(self.held_by.pos.clone());
    }
    var scroll_diff = desired_scroll.minus(self.scroll);
    self.scroll.add(scroll_diff.scale(0.20));
  }

  // physics
  self.physical_objects.forEach(doPhysics);
  doPhysics(char);

  if (char != null) {
    char.frame.pos = char.pos;
    char.frame.vel = char.vel;
    char.frame.on_ladder = char.on_ladder;
  }

  // prepare sprites for drawing
  // physical objects
  self.physical_objects.forEach(prepareObjSprite);

  // lemmings
  for (i = self.control_lemming; i < self.lemmings.length; i += 1) {
    lemming = self.lemmings[i];
    if (lemming.frame.new_image != null) {
      debugger; // is this right?
      lemming.sprite.setAnimation(lemming.frame.new_image)
    }
    // TODO: double check - it relies on animation offset
    lemming.sprite.pos = lemming.frame.pos.plus(
        self.animation_offset[lemming.sprite.animationName]);
  }

  function prepareObjSprite(obj) {
    if (obj.gone) return;
    // TODO animation_offset
    var offset = self.animation_offset[obj.sprite.animationName];
    if (offset == null) offset = new Vec2d(0, 0);
    obj.sprite.pos = obj.pos.plus(offset);
  }

  function doPhysics(obj) {
    if (obj == null || obj.gone) return;
    obj.think(dt);

    if (obj === char && self.held_by != null) return;

    if (obj.life != null) {
      obj.life -= dt;
      if (obj.life <= 0) {
        obj.delete();
        return;
      }
    }

    var apply_belt_velocity = 0;

    // collision with solid blocks
    if (obj.vel.x !== 0 || obj.vel.y !== 0) {
      var new_pos = obj.pos.plus(obj.vel.scaled(dt));
      // find the blocks that we would have passed through and do collision
      // resolution on them, in order
      var vector_it = obj.pos.clone();
      var unit_vector_vel = obj.vel.normalized();
      var last_one = false;
      while (! last_one) {
        vector_it.add(unit_vector_vel.scaled(tile_size));
        if (obj.pos.distanceSqrd(new_pos) < obj.pos.distanceSqrd(vector_it)) {
          last_one = true;
          vector_it = new_pos;
        }

        // try resolving the collision both ways (y then x, x then y) and choose the one that results in the most velocity
        var x_first_new_pos = vector_it.clone();
        var x_first_new_vel = obj.vel.clone();
        var did_x = resolve_x(self, obj, x_first_new_pos, x_first_new_vel, obj.size);
        var did_y = resolve_y(self, obj, x_first_new_pos, x_first_new_vel, obj.size);

        if (did_x || did_y) {
          var y_first_new_pos = vector_it.clone();
          var y_first_new_vel = obj.vel.clone();
          resolve_y(self, obj, y_first_new_pos, y_first_new_vel, obj.size);
          resolve_x(self, obj, y_first_new_pos, y_first_new_vel, obj.size);
          if (x_first_new_vel.lengthSqrd() > y_first_new_vel.lengthSqrd()) {
            new_pos = x_first_new_pos;
            obj.vel = x_first_new_vel;
          } else {
            new_pos = y_first_new_pos;
            obj.vel = y_first_new_vel;
          }
          break;
        }
      }
      // apply velocity to position
      obj.pos = new_pos;
    }
    var corner_foot_block = new Vec2d(obj.pos.x, obj.pos.y - 1).divBy(tile_size).floor();
    var blocks_at_feet = [];
    for (var x = 0; x < obj.size.x; x += 1) {
      blocks_at_feet.push(new Vec2d(corner_foot_block.x+x, corner_foot_block.y));
    }
    if (Math.floor(obj.pos.x / self.level.tileWidth) !==
        Math.floor(Math.round(obj.pos.x / self.level.tileWidth)))
    {
      blocks_at_feet.push(new Vec2d(
          blocks_at_feet[blocks_at_feet.length - 1].x + 1,
          blocks_at_feet[blocks_at_feet.length - 1].y));
    }
    var tiles_at_feet = blocks_at_feet.map(function(block) {
      return self.getTile(block);
    });
    var blocks_at_feet_solid = blocks_at_feet.map(function(block) {
      return self.getBlockIsSolid(block);
    });
    var on_ground = blocks_at_feet_solid.some(function(isSolid) {
      return isSolid;
    });

    if (! on_ground && ! obj.on_ladder) self.setRunningSound(null);

    if (obj.can_pick_up_stuff) {
      doItemPickups(self, obj, tiles_at_feet, char, corner_foot_block,
          blocks_at_feet);
    }

    var belt_velocity = 800;
    tiles_at_feet.forEach(function(tile) {
      if (tile.belt == null) return;
      apply_belt_velocity += tile.belt * belt_velocity * dt;
    });

    if (obj === char) {
      applyInputToPhysics(self, obj, corner_foot_block, on_ground, dt);
    }

    // gravity
    var gravity_accel = 800;
    if (! on_ground && ! obj.on_ladder) {
      obj.vel.y -= gravity_accel * dt;
    }

    // friction
    var friction_accel = 380;
    if (on_ground) {
      if (Math.abs(obj.vel.x) < Math.abs(friction_accel * dt)) {
        obj.vel.x = 0;
      } else {
        obj.vel.x += friction_accel * dt * -sign(obj.vel.x);
      }
    }

    // conveyor belts
    var max_conveyor_speed = 700;
    apply_belt_velocity = Math.max(-belt_velocity * dt, apply_belt_velocity);
    apply_belt_velocity = Math.min(belt_velocity * dt, apply_belt_velocity);
    if (apply_belt_velocity > 0) {
      if (obj.vel.x + apply_belt_velocity > max_conveyor_speed) {
        obj.vel.x += Math.max(max_conveyor_speed - obj.vel.x, 0);
      } else {
        obj.vel.x += apply_belt_velocity;
      }
    } else if (apply_belt_velocity < 0) {
      if (obj.vel.x + apply_belt_velocity < -max_conveyor_speed) {
        obj.vel.x += Math.min(-max_conveyor_speed - obj.vel.x, 0);
      } else {
        obj.vel.x += apply_belt_velocity;
      }
    }

    if (on_ground && obj.vel.lengthSqrd() === 0 && obj.is_belly_flop) {
      // replace tiles it took up with dead body
      var mid_block = obj.pos.divBy(tile_size).apply(Math.round).floor();
      self.setTile(mid_block.offset(0, 0), self.tilesEnum.DeadBodyLeft);
      self.setTile(mid_block.offset(1, 0), self.tilesEnum.DeadBodyMiddle);
      self.setTile(mid_block.offset(2, 0), self.tilesEnum.DeadBodyRight);

      obj.delete();
    }
  }
};

function doItemPickups(self, obj, tiles_at_feet, char, corner_foot_block,
    blocks_at_feet)
{
  var corner_block = obj.pos.divBy(tile_size).apply(Math.Round).floor();
  var feet_block = obj.pos.plus(tile_size.scaled(0.5)).divBy(tile_size).apply(Math.round).floor();
  var it = new Vec2d(0, 0);
  for (it.y = 0; it.y < obj.size.y; it.y += 1) {
    for (it.x = 0; it.x < obj.size.x; it.x += 1) {
      var block = corner_block.plus(it);
      var tile = self.getTile(block);

      // +1
      if (self.control_lemming - self.plus_ones_queued > 0) {
        if (tile.id === self.tilesEnum.PlusOne) {
          self.plus_ones_queued += 1;
          self.setTile(block, self.tilesEnum.Air);
          var sfx_player = self.playSoundAt('coin_pickup', block.times(tile_size));
          sfx_player.playbackRate = 2 - (self.lemmings.length - self.control_lemming - 1) / self.lemmings.length;
        } else if (tile.id === self.tilesEnum.PlusForever) {
          self.plus_ones_queued = self.control_lemming;
          self.playSoundAt('coin_pickup', block.times(tile_size));
        }
      }

      // land mine
      if (tile.mine) {
        if (obj === char) {
          self.explode_queued = true;
        } else {
          self.handleExplosion(block.times(tile_size), new Vec2d(0, 0));
          obj.delete();
        }
        self.setTile(block, self.tilesEnum.Air);
        self.playSoundAt('mine_beep', block.times(tile_size));
      }

      // buttons
      var button_to_activate = self.buttons[block.toString()];
      if (button_to_activate != null) button_to_activate.hit(obj);

      // victory
      if (self.isVictory(block) && ! self.handled_victory) {
        self.handled_victory = true;
        self.handleVictory();
      }
    }
  }

  // spikes
  var anyIsSpike = tiles_at_feet.some(function(tile) {
    return tile.spike;
  });
  if (anyIsSpike) {
    if (obj === char) {
      self.detach_queued = true;
    } else {
      obj.delete();
    }
    if (obj.is_belly_flop) {
      self.setTile(corner_foot_block, self.tilesEnum.DeadBodyLeft);
      self.setTile(corner_foot_block.offset(1, 0), self.tilesEnum.DeadBodyMiddle);
      self.setTile(corner_foot_block.offset(2, 0), self.tilesEnum.DeadBodyRight);
    } else {
      self.setTile(corner_foot_block, self.tilesEnum.DeadBodyMiddle);

      if (blocks_at_feet.length > obj.size.x) {
        self.setTile(corner_foot_block.offset(1, 0), self.tilesEnum.DeadBodyMiddle);
      }

      // TODO minus thing
      var negate = "";
      if (obj.vel.x < 0) negate = '-';
      var sprite = new chem.Sprite(ani[negate+'lem_die'], {
        batch: self.batch_level,
        zOrder: self.group_fg,
      });
      var new_obj = new PhysicsObject(obj.pos, new Vec2d(0, 0), sprite,
          obj.size, chem.resources.animations.lem_die.duration);
      self.physical_objects.append(new_obj);
    }
    self.playSoundAt('spike_death', corner_foot_block.times(tile_size));
    self.spawnGoreExplosion(obj.pos, obj.vel, obj.size);
  }
}

function applyInputToPhysics(self, obj, corner_foot_block, on_ground, dt) {
  var acceleration = 900;
  var max_speed = 200;
  var move_left = self.game.engine.buttonState(self.controls[Control.MoveLeft]);
  var move_right = self.game.engine.buttonState(self.controls[Control.MoveRight]);
  var move_up = self.game.engine.buttonState(self.controls[Control.MoveUp]);
  var move_down = self.game.engine.buttonState(self.controls[Control.MoveDown]);
  if (!move_up && (move_left || move_right || move_down)) {
    obj.on_ladder = false;
  }
  var ladder_at_feet = self.getTile(corner_foot_block, 1);
  if (obj.on_ladder && !ladder_at_feet.ladder) {
    obj.on_ladder = false;
  }
  if (move_left && !move_right) {
    if (obj.vel.x - acceleration * dt < -max_speed) {
      obj.vel.x += Math.min(-max_speed - obj.vel.x, 0);
    } else {
      obj.vel.x -= acceleration * dt;
    }

    // switch sprite to running left
    if (on_ground) {
      // TODO minus thing
      if (obj.sprite.animation !== ani['-lem_run']) {
        obj.sprite.setAnimation(ani['-lem_run']);
        // TODO new_image thing
        obj.frame.new_image = obj.sprite.image;

        self.setRunningSound(self.running_audio);
      }
    }
  } else if (move_right && !move_left) {
    if (obj.vel.x + acceleration * dt > max_speed) {
      obj.vel.x += Math.max(max_speed - obj.vel.x, 0);
    } else {
      obj.vel.x += acceleration * dt;
    }

    // switch sprite to running right
    if (on_ground) {
      if (obj.sprite.animation !== ani.lem_run) {
        obj.sprite.setAnimation(ani.lem_run);
        // TODO new_image thing
        obj.frame.new_image = obj.sprite.image;

        self.setRunningSound(self.running_audio);
      }
    }
  } else if (on_ground) {
    // switch sprite to still
    if (obj.sprite.animation !== ani.lem_crazy) {
      obj.sprite.setAnimation(ani.lem_crazy);
      debugger; // TODO new_image wtf? sprite.image wtf?
      obj.frame.new_image = obj.sprite.image;

      self.setRunningSound(null);
    }
  }
  var ladder_velocity = 200;
  var new_pos;
  var new_pos_grid;
  if (move_up && ladder_at_feet.ladder) {
    new_pos = new Vec2d(obj.pos.x, obj.pos.y + ladder_velocity * dt);
    new_pos_grid = new_pos.divBy(tile_size).floor();

    if (! self.getTile(new_pos_grid, 1).ladder) {
      obj.pos.y = new_pos_grid.y * self.level.tileHeight;
      obj.on_ladder = false;
    } else {
      obj.on_ladder = true;
      obj.vel.y = 0;
      obj.vel.x = 0;
      obj.pos.y += ladder_velocity * dt;

      // switch sprite to ladder
      if (obj.sprite.animation !== ani.lem_climb) {
        obj.sprite.setAnimation(ani.lem_climb);
        // TODO new_image wtf
        obj.frame.new_image = obj.sprite.image;

        self.setRunningSound(self.ladder_audio);
      }
    }
  } else if (move_down && ladder_at_feet.ladder) {
    new_pos = new Vec2d(obj.pos.x, obj.pos.y - ladder_velocity * dt);
    new_pos_grid = new_pos.divBy(tile_size).floor();

    if (self.getBlockIsSolid(new_pos_grid) &&
        !self.getTile(new_pos_grid, 1).ladder)
    {
      obj.pos.y = (new_pos_grid.y + 1) * self.level.tileHeight;
      obj.on_ladder = false;
    } else {
      obj.on_ladder = true;
      obj.vel.x = 0;
      obj.pos.y -= ladder_velocity * dt;

      // switch sprite to ladder
      if (obj.sprite.animation !== ani.lem_climb) {
        obj.sprite.setAnimation(ani.lem_climb);
        // TODO new_image wtf
        obj.frame.new_image = obj.sprite.image;

        self.setRunningSound(self.ladder_audio);
      }
    }
  }

  if (move_up && on_ground && !obj.on_ladder) {
    var jump_velocity = 350;
    obj.vel.y = jump_velocity;

    // switch sprite to jump
    var animation_name = 'lem_jump';
    if (obj.vel.x < 0) {
      // TODO minus thing
      animation_name = '-' + animation_name;
    }
    if (obj.sprite.animation !== ani[animation_name]) {
      obj.sprite.setAnimation(ani[animation_name]);
      // TODO new_image wtf?
      obj.frame.new_image = obj.sprite.image;

      self.playSoundAt('jump', obj.pos);
      self.setRunningSound(null);
    }
  } else {
    self.jump_scheduled = false;
  }
  if (obj.on_ladder && (! move_up && !move_down)) {
    // switch sprite to ladder, still
    if (obj.sprite.animation !== ani.lem_climb_still) {
      obj.sprite.setAnimation(ani.lem_climb_still);
      // TODO new_image wtf?
      obj.frame.new_image = obj.sprite.image;

      self.setRunningSound(null);
    }
  }
}

function inWall(self, obj, size) {
  var it = new Vec2d(0, 0);
  for (it.x = 0; it.x < size.x; it.x += 1) {
    for (it.y = 0; it.y < size.y; it.y += 1) {
      var block = obj.pos.divBy(tile_size).apply(Math.round).floor().plus(it);
      if (self.getBlockIsSolid(block)) return true;
    }
  }
  return false;
}

function resolve_x(self, obj, new_pos, vel, obj_size) {
  if (obj.on_ladder) return false;

  var y;
  var new_feet_block;
  var new_body_block;
  var block_solid;
  if (vel.x < 0) {
    new_feet_block = new_pos.divBy(tile_size).floor();
    for (y = 0; y < obj_size.y; y += 1) {
      new_body_block = new Vec2d(new_feet_block.x, new_feet_block.y + y);
      block_solid = self.getBlockIsSolid(new_body_block);
      if (block_solid) {
        new_pos.x = (new_feet_block.x+1)*self.level.tileWidth;
        vel.x = 0;
        return true;
      }
    }
  } else if (vel.x > 0) {
    new_feet_block = new_pos.divBy(tile_size).floor();
    for (y = 0; y < obj_size.y; y += 1) {
      new_body_block = new Vec2d(new_feet_block.x+obj_size.x, new_feet_block.y + y);
      block_solid = self.getBlockIsSolid(new_body_block);
      if (block_solid) {
        new_pos.x = new_feet_block.x * self.level.tileWidth;
        vel.x = 0;
        return true;
      }
    }
  }
  return false;
}

function resolve_y(self, obj, new_pos, vel, obj_size) {
  if (obj.on_ladder) return false;

  var new_feet_block = new_pos.divBy(tile_size).floor();
  var tile_there = self.getTile(new_feet_block);

  // ramps
  if (tile_there.ramp === -1) {
    new_pos.y = new_feet_block.y * self.level.tileHeight + self.level.tileHeight;
  } else if (self.getTile(new Vec2d(new_feet_block.x+1, new_feet_block.y)).ramp === 1) {
    new_pos.y = new_feet_block.y * self.level.tileHeight + self.level.tileHeight;
  }

  var x;
  if (vel.y > 0) {
    // resolve head collisions
    for (x = 0; x < obj_size.x; x += 1) {
      var new_head_block = new Vec2d(new_feet_block.x + x, new_feet_block.y + obj_size.y);
      var block_solid = self.getBlockIsSolid(new_head_block);
      if (block_solid) {
        new_pos.y = new_feet_block.y * self.level.tileHeight;
        vel.y = 0;
        return true;
      }
    }
  } else if (vel.y < 0) {
    // resolve feet collisions
    var new_blocks_at_feet = [];
    for (x = 0; x < obj.size.x; x += 1) {
      new_blocks_at_feet.push(new Vec2d(new_feet_block.x+x, new_feet_block.y));
    }
    if (Math.floor(new_pos.x / self.level.tileWidth) !==
        Math.floor(Math.round(new_pos.x / self.level.tileWidth)))
    {
      new_blocks_at_feet.push(new Vec2d(
            new_blocks_at_feet[new_blocks_at_feet.length-1].x+1,
            new_blocks_at_feet[new_blocks_at_feet.length-1].y));
    }
    var new_blocks_at_feet_solid = new_blocks_at_feet.map(function(block) {
      return self.getBlockIsSolid(block);
    });
    var anyAreSolid = new_blocks_at_feet_solid.some(function(isSolid) {
      return isSolid;
    });
    if (anyAreSolid) {
      new_pos.y = (new_feet_block.y+1)*self.level.tileHeight;
      vel.y = 0;
      return true;
    }
  }
  return false;
}

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
  debugger; // make sure that crazy lookup will work
  return this.level.layers[layer_index].tileAt(block_pos.x, block_pos.y);
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

// TODO: do we need to delete the old sprite?
LevelPlayer.prototype.setTile = function(block_pos, tile) {
  debugger; // make sure this method does the right thing
  this.level.layers[0].setTileAt(block_pos.x, block_pos.y, tile);
  var new_sprite = null;
  if (tile != null) {
    new_sprite = new chem.Sprite(this.tileAnims[tile.id], {
      pos: new Vec2d(this.level.tileWidth * block_pos.x, this.level.tileHeight * block_pos.y),
      batch: this.batch_level,
      zOrder: this.layer_group[0],
    });
  }
  this.sprites[0][block_pos.x][block_pos.y] = new_sprite;
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

LevelPlayer.prototype.load = function(cb) {
  var self = this;

  tmx.parseFile(self.level_fd, function(err, map) {
    if (err) throw err;
    self.level = map;

    tile_size = new Vec2d(self.level.tileWidth, self.level.tileHeight);

    self.loadImages();
    self.loadSoundEffects();

    var tiles = self.level.tileSets[0].tiles;
    self.tilesEnum = {Air: null};
    tiles.forEach(function(tile) {
      if (tile.properties.name) self.tilesEnum[tile.properties.name] = tile;
    });
    self.tileAnims = tiles.map(function(tile) {
      return chem.Animation.fromImage(tile.image);
    });

    // load tiles into sprites
    self.next_group_num = 0;
    self.group_bg2 = self.getNextGroupNum();
    self.group_bg1 = self.getNextGroupNum();

    self.sprites = []; // [layer][x][y]
    var layer;
    for (var i = 0; i < self.level.layers.length; i += 1) {
      layer = self.level.layers[i];
      if (layer.type !== 'tile') continue;
      self.sprites.push([]);
      for (var x = 0; x < self.level.width; x += 1) {
        self.sprites[i].push([]);
        for (var y = 0; y < self.level.height; y += 1) {
          self.sprites[i][x].push(null);
        }
      }
    }

    self.layer_group = [];

    var tileLayerIndex = -1;
    for (var layer_index = 0; layer_index < self.level.layers.length; layer_index += 1)
    {
      layer = self.level.layers[layer_index];
      if (layer.type !== 'tile') continue;
      tileLayerIndex += 1;
      var group = self.getNextGroupNum();
      self.layer_group.push(group);
      for (var ytile = 0; ytile < self.level.height; ytile += 1) {
        // To compensate for pyglet's upside-down y-axis, the Sprites are
        // placed in rows that are backwards compared to what was loaded
        // into the map. The next operation puts all rows upside-down.

        // now that we are using chem, the Y-axis is no longer fucked.
        // but it's probably harder to refactor all the physics and
        // calculations than it is to mess with the sprites right before display.
        // So I'm going to leave this shit in here for now.
        var flippedY = self.level.height - ytile - 1;

        for (var xtile = 0; xtile < self.level.width; xtile += 1) {
          var tile = layer.tileAt(xtile, ytile);
          if (tile) {
            self.sprites[tileLayerIndex][xtile][flippedY] = new chem.Sprite(tile.animation, {
              pos: new Vec2d(self.level.tileWidth * xtile, self.level.tileHeight * ytile),
              batch: self.batch_level,
              zOrder: group,
            });
          }
        }
      }
    }

    var had_player_layer = false;
    var had_start_point = false;

    function translate_y(y, obj_height) {
      obj_height = obj_height == null ? 0 : obj_height;
      return self.level.height * self.level.tileHeight - y - obj_height;
    }

    self.labels = [];
    self.obj_sprites = {};

    self.level.layers.forEach(function(layer) {
      if (layer.type !== 'object') return;
      var group = self.getNextGroupNum();
      if (layer.name === 'PlayerLayer') {
        self.group_char = group;
        had_player_layer = true;
      }
      layer.objects.forEach(function(obj) {
        var anim, pos, size, sprite;
        var up_img, down_img, up_anim, down_anim;
        var up_sprite, down_sprite, button_id;
        var it, state, direction, delay;
        switch (obj.type) {
          case 'StartPoint':
            self.start_point = new Vec2d(obj.x, translate_y(obj.y, obj.height));
            had_start_point = true;
            break;
          case 'Text':
            var font_size = parseInt(obj.properties.font_size || 20, 10);
            self.labels.push(new chem.Label(obj.properties.text, {
              font: font_size + "px Arial",
              pos: new Vec2d(obj.x, obj.y),
              batch: self.batch_level,
              zOrder: group,
              fillStyle: "#000000",
              size: new Vec2d(obj.width, obj.height),
              textAlign: 'left',
              textBaseline: 'top',
            }));
            break;
          case 'Decoration':
            if (obj.properties.img) {
              anim = chem.Animation.fromImage(chem.resources.images[obj.properties.img]);
            } else {
              anim = ani[obj.properties.animation];
            }
            self.obj_sprites.push(new chem.Sprite(anim, {
              pos: new Vec2d(obj.x, obj.y),
              batch: self.batch_level,
              zOrder: group,
            }));
            break;
          case 'Agent':
            direction = obj.properties.direction == null ? 1 :
              parseInt(obj.properties.direction, 10);
            pos = new Vec2d(obj.x, translate_y(obj.y, obj.height));
            size = (new Vec2d(obj.width, obj.height)).div(tile_size).floor();
            if (obj.properties.type === 'monster') {
              var throw_vel = null;
              if (obj.properties.throw_vel_x != null &&
                  obj.properties.throw_vel_y != null)
              {
                throw_vel = new Vec2d(
                    parseFloat(obj.properties.throw_vel_x, 10),
                    parseFloat(obj.properties.throw_vel_y, 10));
              }
              self.physical_objects.push(new Monster(pos, size, group, self.batch_level,
                    self, direction, throw_vel));
            } else if (obj.properties.type === 'gunner') {
              self.physical_objects.push(new Gunner(pos, size, group, self.batch_level, self));
            } else if (obj.properties.type === 'tank') {
              var dir_lock = obj.properties.direction_lock == null ? null :
                parseInt(obj.properties.direction_lock, 10);
              sprite = new chem.Sprite(ani.tank_point, {
                pos: new Vec2d(obj.x, obj.y),
                zOrder: group,
                batch: self.batch_level,
              });
              self.physical_objects.push(new Tank(pos, size, sprite, self, dir_lock));
            }
            break;
          case 'Bridge':
            up_img = chem.resources.images['bridge_up.png'];
            down_img = chem.resources.images['bridge_down.png'];
            if (obj.properties.up_img && obj.properties.down_img) {
              up_img = chem.resources.images[obj.properties.up_img];
              down_img = chem.resources.images[obj.properties.down_img];
            }
            up_anim = chem.Animation.fromImage(up_img);
            down_anim = chem.Animation.fromImage(down_img);
            state = obj.properties.state || 'up';
            button_id = obj.properties.button_id || '0';
            var bridge_pos = new Vec2d(obj.x, translate_y(obj.y, obj.height));
            var bridge_pos_grid = bridge_pos.divBy(tile_size).floor();
            var bridge_size = (new Vec2d(obj.width, obj.height)).div(tile_size).floor();
            up_sprite = new chem.Sprite(up_anim, {
              pos: bridge_pos.clone(),
              batch: self.batch_level,
              zOrder: group,
            });
            down_sprite = new chem.Sprite(down_anim, {
              pos: bridge_pos.clone(),
              batch: self.batch_level,
              zOrder: group,
            });
            var bridge = new Bridge(bridge_pos_grid, bridge_size, state, up_sprite, down_sprite);
            self.button_responders[button_id] = bridge;
            self.platform_objects.push(bridge);
            break;
          case 'TrapDoor':
            anim = chem.Animation.fromImage(chem.resources.images[obj.properties.img]);
            pos = new Vec2d(obj.x, translate_y(obj.y, obj.height));
            var pos_grid = pos.divBy(tile_size).floor();
            size = (new Vec2d(obj.width, obj.height)).div(tile_size).floor();
            sprite = new chem.Sprite(anim, {
              pos: pos.clone(),
              batch: self.batch_level,
              zOrder: group,
            });
            self.button_responders[obj.properties.button_id] = new TrapDoor(pos_grid, size,
                obj.properties.state, sprite, self);
            break;
          case 'Button':
            up_img = chem.resources.images['button_up.png'];
            down_img = chem.resources.images['button_down.png'];
            if (obj.properties.up_img && obj.properties.down_img) {
              up_img = chem.resources.images[obj.properties.up_img];
              down_img = chem.resources.images[obj.properties.down_img];
            }
            up_anim = chem.Animation.fromImage(up_img);
            down_anim = chem.Animation.fromImage(down_img);
            button_id = obj.properties.button_id || '0';
            delay = obj.properties.delay == null ? 2 :
              parseFloat(obj.properties.delay, 10);
            var button_pos = new Vec2d(obj.x, translate_y(obj.y, obj.height));
            var button_pos_grid = button_pos.divBy(tile_size).floor();
            up_sprite = new chem.Sprite(up_anim, {
              pos: button_pos.clone(),
              batch: self.batch_level,
              zOrder: group,
            });
            down_sprite = new chem.Sprite(down_anim, {
              pos: button_pos.clone(),
              batch: self.batch_level,
              zOrder: group,
            });
            self.buttons[button_pos_grid.toString()] = new Button(button_pos_grid, button_id,
                up_sprite, down_sprite, delay, self);
            break;
          case 'GearButton':
            pos = new Vec2d(obj.x, translate_y(obj.y, obj.height));
            size = (new Vec2d(obj.width, obj.height)).div(tile_size).floor();
            pos_grid = pos.divBy(tile_size).floor();
            sprite = new chem.Sprite(ani.gear_turning, {
              pos: pos.clone(),
              batch: self.batch_level,
              zOrder: group,
            });
            var gear = new Gear(pos, size, obj.properties.button_id, sprite, self);
            it = new Vec2d(0, 0);
            for (it.y = pos.y; it.y < pos.y + size.y; it.y += 1) {
              for (it.x = pos.x; it.x < pos.x + size.x; it.x += 1) {
                self.buttons[it.toString()] = gear;
              }
            }
            break;
          case 'Victory':
            pos = (new Vec2d(obj.x, translate_y(obj.y, obj.height))).div(tile_size).floor();
            size = (new Vec2d(obj.width, obj.height)).div(tile_size).floor();
            it = new Vec2d(0, 0);
            for (it.y = pos.y; it.y < pos.y + size.y; it.y += 1) {
              for (it.x = pos.x; it.x < pos.x + size.x; it.x += 1) {
                self.victory[it.toString()] = true;
              }
            }
            break;
          case 'ConveyorBelt':
            pos = new Vec2d(obj.x, translate_y(obj.y, obj.height));
            pos_grid = pos.divBy(tile_size).floor();
            size = (new Vec2d(obj.width, obj.height)).div(tile_size).floor();
            state = obj.properties.state || 'on';
            direction = obj.properties.direction == null ? 1 :
              parseInt(obj.properties.direction, 10);
            sprite = new chem.Sprite(ani.belt_on, {
              pos: pos.clone(),
              zOrder: group,
              batch: self.batch_level,
            });
            self.button_responders[obj.properties.button_id] = new ConveyorBelt(pos_grid,
                size, sprite, self, state, direction);
            break;
          case 'BombSpawner':
            pos = new Vec2d(obj.x, translate_y(obj.y, obj.height));
            size = new Vec2d(obj.width, obj.height);
            state = obj.properties.state || 'on';
            delay = obj.properties.delay == null ? 1 : parseFloat(obj.properties.delay, 10);
            var fuse_min = obj.properties.fuse_min == null ? 1 :
              parseFloat(obj.properties.fuse_min, 10);
            var fuse_max = obj.properties.fuse_max == null ? 3 :
              parseFloat(obj.properties.fuse_max, 10);
            var spawner = new BombSpawner(pos, size, self, delay, state, fuse_min, fuse_max);
            self.button_responders[obj.properties.button_id] = spawner;
            break;
        }
      });
    });

    if (! had_start_point) {
      throw new Error("Level missing start point");
    }

    if (! had_player_layer) {
      console.log("Level was missing PlayerLayer");
      self.group_char = self.getNextGroupNum();
    }
    self.group_fg = self.getNextGroupNum();

    // load bg music
    var bg_music_src = self.level.properties.bg_music;
    if (bg_music_src) {
      self.bg_music = new Audio(bg_music_src);
      self.bg_music.loop = true;
      self.bg_music.play();
    }

    cb();
  });
};

LevelPlayer.prototype.isVictory = function(block) {
  return !!this.victory[block.toString()];
};

LevelPlayer.prototype.spawnBullet = function(pos, vel) {
  var sprite = new chem.Sprite(ani.bullet, {
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
  var sprite = new chem.Sprite(ani.bomb, {
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
        Math.random() * size.x * this.level.tileWidth,
        Math.random() * size.y * this.level.tileHeight);
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
