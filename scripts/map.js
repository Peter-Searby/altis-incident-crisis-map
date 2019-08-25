import Map from 'ol/Map.js';
import View from 'ol/View.js';
import {MultiPoint, Point} from 'ol/geom.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import {Circle as CircleStyle, Fill, Stroke, Style} from 'ol/style.js';
import Text from 'ol/style/Text';




var map = new Map({
  layers: [
	new TileLayer({
	  source: new OSM()
	})
  ],
  target: 'map',
  view: new View({
	center: [ 2807000, 4852600 ],
	zoom: 11,
	minZoom: 2,
	maxZoom: 18
  })
});

var pointStyle = new Style({
  image: new CircleStyle({
	radius: 20,
	fill: new Fill({color: 'blue'}),
	stroke: new Stroke({color: 'black', width: 1})
  }),
  text: new Text({
	  font: '13px sans-serif',
	  text: "20k",
	  fill: new Fill({color: 'white'})
  })
});


var units = []



var url = "test.json";
var vc;
var started = false;

var width = window.innerWidth
|| document.documentElement.clientWidth
|| document.body.clientWidth;

var height = window.innerHeight
|| document.documentElement.clientHeight
|| document.body.clientHeight;
map.setSize([width, height*0.98])
map.on('postcompose', function(event) {
	vc = event.vectorContext;
	vc.setStyle(pointStyle);
	var unit
	for (unit of units) {
		vc.drawGeometry(new Point(unit.loc));
	}
	map.render();
});



map.on('pointermove', function (event) {
    // var pixel = map.getEventPixel(evt.originalEvent);
});


map.render();
sync('[]');

map.on('dblclick', function (event) {
	clearInterval(timer);
});


// TODO run 2 times per second
map.on('click', function (event) {
	var unit = addUnit(event.coordinate)
	sync('[{"type": "add", "unit": '+JSON.stringify(unit)+'}]')
})

function addUnit(pos) {
	var unitId = 0
	if (units.length>0) {
		unitId = units[units.length-1].id+1
	}
	var unit = {id: unitId, loc: pos}
	units.push(unit)
	return unit
}

function sync(changes) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
			var mapJSON = JSON.parse(this.responseText)
			units = mapJSON.units
		}
	}
	xmlhttp.open("POST", "server.js", true)
	xmlhttp.setRequestHeader("Content-Type", "application/json")
	xmlhttp.send('{"changes": '+changes+'}');
}
