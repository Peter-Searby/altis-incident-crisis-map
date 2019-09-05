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
import {defaults as defaultInteractions} from 'ol/interaction.js';
import Graticule from 'ol-ext/control/Graticule.js';
import {toLonLat} from 'ol/proj.js'


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
	constructor(loc, id, type, properties) {
		this.feature = new Feature(new Point(loc))
		this.feature.setId(id)
		this.feature.setStyle(pointStyle)
		this.loc = loc
		this.type = type
		this.properties = properties
	}
	toRaw() {
		return {
			id: this.feature.getId(),
			loc: this.loc,
			type: this.type,
			properties: this.properties
		}
	}
	get id() {
		return this.feature.getId()
	}
	get visualLoc() {
		return this.feature.getGeometry().getCoordinates()
	}
	updateZoom(gridWidth){
		this.feature.getGeometry().setCoordinates([
			Math.round(this.loc[0]/gridWidth)*gridWidth,
			Math.round(this.loc[1]/gridWidth)*gridWidth]
		)
	}
}

var vectorSource = new VectorSource()


var tooltipElement = document.getElementById('tooltip');

var TooltipControl = (function (Control) {
	function TooltipControl(opt_options) {
		var options = opt_options || {};

		tooltipElement.className = 'tooltip ol-unselectable ol-control';


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
			source: new OSM({
				url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png'
			})
		}),
		new VectorLayer({
			source: vectorSource
		})
	],
	target: 'map',
	view: new View({
		center: [ 2807000, 4852600 ],
		zoom: 11,
		minZoom: 6,
		maxZoom: 14
	}),
	keyboardEventTarget: document
});



var graticule = new Graticule({
	style: new Style({
		stroke: new Stroke({
			width: 0.3,
			color: ['black']
		})
	}),
	borderWidth: 1,
	step: 1000,
	projection: 'EPSG:3857',
});

graticule.setMap(map)

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
	map.render()
});


map.render();
sync('[]');

updateZoom();

var defaultUnitProperties = {
	"Speed": 50,
	"Range": 5,
	"Ammunition": 100,
	"Size": 100,
	"Vision": 10,
	"Concealment": 1
}

var defaultUnitType = "Carrier"

function addUnit(loc, id, type, properties) {
	if (id == undefined) {
		if (units) {
			id = units[units.length-1].id+1
		} else {
			id = 0
		}
	}
	loc[0] = Math.round(loc[0]/1000)*1000
	loc[1] = Math.round(loc[1]/1000)*1000

	if (type == undefined) {
		type = defaultUnitType
	}
	if (properties == undefined) {
		properties = defaultUnitProperties
	}

	var unit = new Unit(loc, id, type, properties)
	vectorSource.addFeature(unit.feature)
	units.push(unit)
	updateZoom();
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
				addUnit(rawUnit.loc, rawUnit.id, rawUnit.type, rawUnit.properties)
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

function getUnitsAt(pixel) {
	var foundUnits = []
	for (var unit of units) {
		var unitPixel = map.getPixelFromCoordinate(unit.visualLoc)
		var distance = Math.hypot(unitPixel[0]-pixel[0]-15*unitPixel[0]/width, unitPixel[1] - pixel[1]-4*unitPixel[1]/height)
		if (distance<22) {
			foundUnits.push(unit)
		}
	}
	return foundUnits
}


function displayTooltip(units, pixel) {
	tooltip.style.cssText = `
	position: absolute;
	background-color: white;
	top: ${pixel[1]}px;
	left: ${pixel[0]}px;
	display:block;
	`
	var tooltipTable = document.getElementById("tooltipTable")
	if (units.length == 1) {
		var unit = units[0]
		tooltipTable.innerHTML = `
		<tr>
			<th>${unit.type}</th>
		</tr>
		`
		for (var prop in unit.properties) {
			tooltipTable.innerHTML += `
			<tr>
				<td>${prop}</td>
				<td>${unit.properties[prop]}</td>
			</tr>
			`
		}
	} else {
		// TODO
	}
}

function hideTooltip() {
	tooltip.style.cssText = 'display:none;'
}

map.on('click', function (event) {
	var unitsUnder = getUnitsAt(event.pixel)
	if (unitsUnder.length != 0) {
		displayTooltip(unitsUnder, event.pixel)
	} else {
		hideTooltip();
	}
})

map.on('movestart', function (event) {
	hideTooltip();
})

map.on('moveend', function (event) {
	updateZoom();
})

function updateZoom() {
	function setGraticuleWidth(width) {
		graticule.setStyle(new Style({
			stroke: new Stroke({
				color: ['black'],
				width: width,
			})
		}))
	}
	var zoom = map.getView().getZoom()
	var gridWidth = 1000
	switch (zoom) {
		case 14:
			setGraticuleWidth(0.3)
			break;
		case 13:
			setGraticuleWidth(0.1)
			break;
		case 12:
			gridWidth = 2000
			setGraticuleWidth(0.05)
			break;
		case 11:
			gridWidth = 5000
			setGraticuleWidth(0.02)
			break;
		case 10:
			gridWidth = 10000
			setGraticuleWidth(0.01)
			break;
		case 9:
			gridWidth = 20000
			setGraticuleWidth(0.005)
			break;
		case 8:
			gridWidth = 30000
			setGraticuleWidth(0.002)
			break;
		case 7:
			gridWidth = 50000
			setGraticuleWidth(0.001)
			break;
		default:
			gridWidth = 150000
			setGraticuleWidth(0.001)
			break;
	}
	for (var unit of units) {
		unit.updateZoom(gridWidth)
	}
}


function rightClick(e) {
	e.preventDefault()
	var unit = addUnit(map.getCoordinateFromPixel([e.clientX, e.clientY]))
	var rawUnit = unit.toRaw()
	sync('[{"type": "add", "unit": '+JSON.stringify(rawUnit)+'}]')
}
