var TileSet = require('./tiles').TileSet;
var chem = require('chem');
var Vec2d = chem.vec2d.Vec2d;
var util = require('util');

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
var lemming_count = 9;
var lemming_response_time = 0.40;

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

  if (this.state) {
    this.interval = setInterval(this.spawn.bind(this), this.delay * 1000);
  } else {
    clearInterval(this.interval);
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
  this.img_bullet = chem.resources.getImage('bullet');
  this.img_bomb = chem.resources.getImage('bomb');
  this.img_gore = [
    chem.resources.getImage('gore1'),
    chem.resources.getImage('gore2'),
    chem.resources.getImage('gore3'),
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
  // TODO: port this function
};

LevelPlayer.prototype.getDesiredScroll = function(point) {
  // TODO: port this function
};

LevelPlayer.prototype.clear = function() {
  // TODO: port this function
};

LevelPlayer.prototype.start = function() {
  // TODO: port this function
};

LevelPlayer.prototype.getGrabbedBy = function(monster, throw_vel) {
  // TODO: port this function
};

LevelPlayer.prototype.detachHeadLemming = function() {
  // TODO: port this function
};

LevelPlayer.prototype.handleExplosion = function(pos, vel, caused_by_self) {
  // TODO: port this function
};

LevelPlayer.prototype.handleGameOver = function() {
  // TODO: port this function
};

LevelPlayer.prototype.handleVictory = function() {
  // TODO: port this function
};

LevelPlayer.prototype.update = function(dt, dx) {
  // TODO: port this function
};

LevelPlayer.prototype.on_key_press = function(button) {
  // TODO: port this function
  // TODO: probably want to move the logic to update and
  // utilize buttonJustPressed
};

LevelPlayer.prototype.on_draw = function() {
  // TODO: port this function
};

LevelPlayer.prototype.blockAt = function(abs_pt) {
  // TODO: port this function
};

LevelPlayer.prototype.getTile = function(block_pos, layer_index) {
  // TODO: port this function
};

LevelPlayer.prototype.getBlockIsSolid = function(block_pos) {
  // TODO: port this function
};

LevelPlayer.prototype.setTile = function(block_pos, tile_Id) {
  // TODO: port this function
};

LevelPlayer.prototype.garbage_collect = function(dt) {
  // TODO: port this function
};

LevelPlayer.prototype.hitButtonId = function(button_id) {
  // TODO: port this function
};

LevelPlayer.prototype.load = function() {
  // TODO: port this function
};

LevelPlayer.prototype.isVictory = function() {
  // TODO: port this function
};

LevelPlayer.prototype.execute = function() {
  // TODO: port this function
};

LevelPlayer.prototype.spawnBullet = function(pos, vel) {
  // TODO: port this function
};

LevelPlayer.prototype.hitByBullet = function() {
  // TODO: port this function
};

LevelPlayer.prototype.spawnBomb = function(pos, vel, fuse) {
  // TODO: port this function
};

LevelPlayer.prototype.playSoundAt = function(sfx_name, pos) {
  // TODO: port this function
};

LevelPlayer.prototype.spawnGoreExplosion = function(pos, vel, size) {
  // TODO: port this function
};
