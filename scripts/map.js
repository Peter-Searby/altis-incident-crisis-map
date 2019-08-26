import Map from 'ol/Map.js';
import View from 'ol/View.js';
import {MultiPoint, Point} from 'ol/geom.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import {Circle as CircleStyle, Fill, Stroke, Style} from 'ol/style.js';
import Text from 'ol/style/Text';
import Feature from 'ol/Feature';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';


class Unit {
	constructor(loc, id) {
		if (id == undefined) {
			this.feature = loc
		} else {
			this.feature = new Feature(new Point(loc))
			this.feature.setId(id)
			vectorSource.addFeature(this.feature)
		}
	}
	toRaw() {
		return {id: this.feature.getId(), loc: this.feature.getGeometry().getCoordinates()}
	}
	get id() {
		return this.feature.getId()
	}
	get loc() {
		return this.feature.getGeometry().getCoordinates()
	}
}

var vectorSource = new VectorSource()



var map = new Map({
	layers: [
		new TileLayer({
			source: new OSM()
		}),
		new VectorLayer({
			source: vectorSource
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
var started = false;

var width = window.innerWidth
|| document.documentElement.clientWidth
|| document.body.clientWidth;

var height = window.innerHeight
|| document.documentElement.clientHeight
|| document.body.clientHeight;

document.getElementById('map').oncontextmenu = rightClick

map.setSize([width, height*0.98])


map.on('postcompose', function(event) {
	var vc = event.vectorContext;
	var unit
	for (unit of units) {
		vc.drawFeature(unit.feature, pointStyle)
	}
	map.render()
});



map.on('pointermove', function (event) {
    // var pixel = map.getEventPixel(evt.originalEvent);
});


map.render();
sync('[]');

// map.on('dblclick', function (event) {
// 	clearInterval(timer);
// });


map.on('click', function (event) {
	var unitsUnder = map.getFeaturesAtPixel(event.pixel, {hitTolerance: 20})
	if (unitsUnder) {
		displayTooltip(unitsUnder[0])
	} else {
		console.log("no unit: "+unitsUnder)
	}
})

function addUnit(loc, id) {
	if (id == undefined) {
		if (units) {
			id = units[units.length-1].id+1
		} else {
			id = 0
		}
	}
	var unit = new Unit(loc, id)
	units.push(unit)
	return unit
}

function sync(changes) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = function() {
	    if (this.readyState == 4 && this.status == 200) {
			var mapJSON = JSON.parse(this.responseText)
			units = []
			for (var rawUnit of mapJSON.units) {
				addUnit(rawUnit.loc, rawUnit.id)
			}
		}
	}
	xmlhttp.open("POST", "server.js", true)
	xmlhttp.setRequestHeader("Content-Type", "application/json")
	xmlhttp.send('{"changes": '+changes+'}');
}

function rightClick(e) {
	e.preventDefault()
	var unit = addUnit(map.getCoordinateFromPixel([e.clientX, e.clientY]))
	var rawUnit = unit.toRaw()
	sync('[{"type": "add", "unit": '+JSON.stringify(rawUnit)+'}]')
}

function getUnit(feature) {
	for (var unit of units) {
		if (unit.feature == feature) {
			return unit
		}
	}
}


function displayTooltip(unitFeature) {
	var unit = getUnit(unitFeature)
	console.log("found unit!")
}
