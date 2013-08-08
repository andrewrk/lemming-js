// the main source file which depends on the rest of your source files.
exports.main = 'src/main';

exports.spritesheet = {
  defaults: {
    delay: 0.1,
    loop: true,
    // possible values: a Vec2d instance, or one of:
    // ["center", "topleft", "topright", "bottomleft", "bottomright",
    //  "top", "right", "bottom", "left"]
    anchor: "center"
  },
  animations: {
    lem_still: {
      frames: ['lem/17.png'],
      anchor: v(32, 64),
    },
    lem_crazy: {
      anchor: v(32, 64),
      frames: [
        'lem/18.png',
        'lem/19.png',
        'lem/20.png',
        'lem/21.png',
        'lem/22.png',
        'lem/23.png',
        'lem/24.png',
      ],
    },
    lem_jump: {
      loop: false,
      anchor: v(32, 64),
      frames: [
        'lem/10.png',
        'lem/11.png',
      ],
    },
    lem_run: {
      anchor: v(32, 64),
      frames: [
        'lem/01.png',
        'lem/02.png',
        'lem/03.png',
      ],
    },
    lem_belly_flop: {
      loop: false,
      anchor: v(16, 32),
      frames: [
        'lem/12.png',
        'lem/13.png',
        'lem/14.png',
        'lem/15.png',
      ],
    },
    lem_die: {
      anchor: v(32, 64),
      frames: [
        'lem/04.png',
        'lem/05.png',
        'lem/06.png',
        'lem/07.png',
        'lem/08.png',
        'lem/09.png',
      ],
    },
    lem_climb: {
      anchor: v(32, 64),
      frames: [
        'lem/25.png',
        'lem/26.png',
        'lem/27.png',
        'lem/28.png',
        'lem/27.png',
        'lem/26.png',
      ],
    },
    lem_climb_still: {
      anchor: v(32, 64),
      frames: ['lem/27.png'],
    },
    explosion: {
      delay: 0.05,
    },
    house: {
      anchor: 'bottomleft',
    },
    monster_still: {
      anchor: 'bottomleft',
      frames: [
        'monster/01.png',
        'monster/02.png',
        'monster/03.png',
        'monster/02.png',
      ],
    },
    monster_throw: {
      loop: false,
      anchor: 'bottomleft',
      frames: [
        'monster/04.png',
        'monster/05.png',
        'monster/06.png',
        'monster/07.png',
        'monster/08.png',
        'monster/09.png',
      ],
    },
    gunner_still: {
      anchor: v(16, 80),
      frames: [ 'gunner/01.png' ]
    },
    gunner_point: {
      anchor: v(16, 80),
      frames: [ 'gunner/02.png' ]
    },
    gunner_shoot: {
      loop: false,
      anchor: v(16, 80),
      frames: [
        'gunner/03.png',
        'gunner/04.png',
        'gunner/02.png',
      ],
    },
    belt_on: {
      delay: 0.05,
      anchor: 'bottomleft',
      frames: 'belt',
    },
    belt_off: {
      anchor: 'bottomleft',
      frames: ['belt/01.png'],
    },
    tank_point: {
      anchor: v(16, 48),
      frames: ['tank/01.png'],
    },
    tank_shoot: {
      loop: false,
      anchor: v(16, 48),
      frames: [
        'tank/02.png',
        'tank/03.png',
        'tank/01.png',
      ],
    },
    gear_turning: {
      anchor: 'bottomleft',
      frames: [
        'gear/01.png',
        'gear/02.png',
        'gear/03.png',
        'gear/04.png',
      ],
    },
    gear_bloody: {
      anchor: 'bottomleft',
      frames: ['gear/05.png'],
    },
    'title/bg': {
      anchor: 'topleft',
    },
    'title/title': {
      anchor: 'bottomleft',
    },
    'title/continue': {
      anchor: 'bottomleft',
    },
    'title/new_game': {
      anchor: 'bottomleft',
    },
    'title/arrow': {
      anchor: 'bottomleft',
    },
    'title/lem': {
      anchor: 'bottomleft',
    },
    'bullet': {},
    'bomb': {},
    'gore1': {},
    'gore2': {},
    'gore3': {},
  },
};

function v(x, y) {
  return {x: x, y: y};
}
