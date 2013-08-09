var chem = require('chem');
var v = chem.vec2d;

module.exports = {
  lem_still: v(32, 0),
  lem_crazy: v(32, 0),
  lem_jump: v(32, 0),
  lem_run: v(32, 0),
  lem_belly_flop: v(16, 32),
  lem_die: v(32, 0),
  lem_climb: v(32, 0),
  lem_climb_still: v(32, 0),

  explosion: v(30, 40),

  house: v(224, 240),

  monster_still: v(0, 0),
  monster_throw: v(0, 0),

  gunner_still: v(16, 0),
  gunner_point: v(16, 0),
  gunner_shoot: v(16, 0),

  belt_on: v(0, 0),
  belt_off: v(0, 0),

  tank_point: v(16, 0),
  tank_shoot: v(16, 0),

  gear_turning: v(0, 0),
  gear_bloody: v(0, 0),
};
