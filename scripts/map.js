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
import {defaults as defaultControls, Control} from 'ol/control.js';


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

class Unit {
	constructor(loc, id) {
		this.feature = new Feature(new Point(loc))
		this.feature.setId(id)
		this.feature.setStyle(pointStyle)
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


var tooltipElement = document.getElementById('tooltip');

var TooltipControl = (function (Control) {
	function TooltipControl(opt_options) {
		var options = opt_options || {};

		// var button = document.createElement('button');
		// button.innerHTML = 'N';

		tooltipElement.className = 'tooltip ol-unselectable ol-control';
		// <table id="tooltipTable">
		// 	<tr>
		// 		<th>Unit Properties</th>
		// 	</tr>
		// 	<tr>
		// 		<td>test</td>
		// 		<td>1</td>
		// </table>
		// var table = document.createElement('table')
		// table.id = 'tooltip'
		// table.innerHTML = `
		// <tr>
		// 	<th>Unit Properties</th>
		// </tr>
		// <tr>
		// 	<td>test</td>
		// 	<td>1</td>
		// </tr>
		// `


		// tooltipElement.appendChild(table);

		Control.call(this, {
			element: tooltipElement,
			target: options.target
		});

		tooltipElement.addEventListener('click', this.receiveClick.bind(this), false);
	}

	if ( Control ) TooltipControl.__proto__ = Control;
	TooltipControl.prototype = Object.create( Control && Control.prototype );
	TooltipControl.prototype.constructor = TooltipControl;

	TooltipControl.prototype.receiveClick = function receiveClick () {
		this.getMap().getView().setRotation(90);
		//TODO
	};

	return TooltipControl;
  }(Control));




var map = new Map({
	controls: defaultControls().extend([
		new TooltipControl()
    ]),
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
	// var vc = event.vectorContext;
	// var unit
	// for (unit of units) {
	// 	vc.drawFeature(unit.feature, pointStyle)
	// }
	map.render()
});


map.render();
sync('[]');



function addUnit(loc, id) {
	if (id == undefined) {
		if (units) {
			id = units[units.length-1].id+1
		} else {
			id = 0
		}
	}
	var unit = new Unit(loc, id)
	vectorSource.addFeature(unit.feature)
	units.push(unit)
	return unit
}

function sync(changes) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = function() {
	    if (this.readyState == 4 && this.status == 200) {
			var mapJSON = JSON.parse(this.responseText)
			units = []
			vectorSource.clear()
			for (var rawUnit of mapJSON.units) {
				addUnit(rawUnit.loc, rawUnit.id)
			}
		}
	}
	xmlhttp.open("POST", "server.js", true)
	xmlhttp.setRequestHeader("Content-Type", "application/json")
	xmlhttp.send('{"changes": '+changes+'}');
}

function getUnitFromFeature(feature) {
	for (var unit of units) {
		if (unit.feature == feature) {
			return unit
		}
	}
	throw "Can't find unit with requested feature"
}

function getUnitAt(pixel) {
	var foundUnits = []
	for (var unit of units) {
		var unitPixel = map.getPixelFromCoordinate(unit.loc)
		var distance = Math.hypot(unitPixel[0]-pixel[0]-15*unitPixel[0]/width, unitPixel[1] - pixel[1]-4*unitPixel[1]/height)
		if (distance<22) {
			foundUnits.push(unit, distance)
		}
		console.log(distance);
	}
	if (foundUnits.length>0) {
		var sortedUnits = foundUnits.sort(function(a,b){return a[1]-b[1]})
		return sortedUnits[0]
	}
}


function displayTooltip(unit, pixel) {
	console.log(`found unit!: ${unit.loc}`)
	tooltip.style = `
	background-color: white;
	top: ${pixel[1]};
	left: ${pixel[0]};
	`
}

map.on('click', function (event) {
	var unitUnder = getUnitAt(event.pixel)
	console.log(`Click at ${event.pixel}`)
	if (unitUnder) {
		displayTooltip(unitUnder, event.pixel)
	} else {
		console.log("no unit")
	}
})


function rightClick(e) {
	e.preventDefault()
	var unit = addUnit(map.getCoordinateFromPixel([e.clientX, e.clientY]))
	var rawUnit = unit.toRaw()
	sync('[{"type": "add", "unit": '+JSON.stringify(rawUnit)+'}]')
}


map.on('pointermove', function (event) {
	// var pixel = map.getEventPixel(evt.originalEvent);
});

// map.on('dblclick', function (event) {
// 	clearInterval(timer);
// });
