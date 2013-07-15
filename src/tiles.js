exports.TileSet = TileSet;

var property_types = {
  // unspecified is str
  solid: _bool,
  spike: _bool,
  mine: _bool,
  ramp: _int,
  belt: _int,
};

function TileSet(tsx_tileset) {
  this.info = {};
  this.info[0] = {id: 0, name: 'Air'};
  this.enum = {Air: 0};
  for (var i = 0; i < tsx_tileset.tiles.length; ++i) {
    var tile = tsx_tileset.tiles[i];
    tile.id = _int(tile.id) + 1;
    var props = {id: tile.id};
    for (var name in tile.properties) {
      var value = tile.properties[name];
      var fn = property_types[name];
      if (fn) value = fn(value);
      props[name] = value;
      //print("{0} - {1}: {2}".format(id, name, value))
    }
    this.info[tile.id] = props;
    this.enum[props.name] = tile.id;
  }
}

function _bool(b) {
  return !!_int(b);
}

function _int(n) {
  return Math.floor(parseInt(n, 10));
}
