import Map from 'ol/Map.js';
import View from 'ol/View.js';
import {MultiPoint, Point, LineString} from 'ol/geom.js';
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
import {toLonLat} from 'ol/proj.js';
import Button from 'ol-ext/control/Button.js';
import Dialog from 'ol-ext/control/Dialog.js'
import Overlay from 'ol-ext/control/Overlay.js'


function sizeToString(size) {
	if (size >= 1000) {
		return `${Math.round(size/1000)}k`
	} else {
		return `${size}`
	}
}

function pointStyleGen(text) {
	return new Style({
		image: new CircleStyle({
			radius: 20,
			fill: new Fill({color: 'blue'}),
			stroke: new Stroke({color: 'black', width: 1})
		}),
		text: new Text({
			font: '13px sans-serif',
			text: text,
			fill: new Fill({color: 'white'})
		})
	})
}

class Unit {
	constructor(loc, id, type, properties) {
		this.feature = new Feature(new Point(loc))
		this.feature.setId(id)
		var style = pointStyleGen(sizeToString(properties["Size"]))
		this.feature.setStyle(style)
		this.loc = loc
		this.type = type
		this.properties = properties
		this.display()
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
	hide() {
		if (vectorSource.hasFeature(this.feature)){
			vectorSource.removeFeature(this.feature)
		}
	}
	display() {
		vectorSource.addFeature(this.feature)
	}
}

class UnitGroup {
	constructor(unit) {
		this.units = [unit]
		this.feature = unit.feature
	}
	addUnit(unit) {
		if (this.units.length == 1) {
			this.units[0].hide()
			this.feature = new Feature(new Point(unit.visualLoc))
			this.feature.setStyle(pointStyleGen("..."))
			vectorSource.addFeature(this.feature)
		}
		this.units.push(unit)
		unit.hide()
	}
}



var vectorSource = new VectorSource()
var movesSource = new VectorSource()
var lastClick = null
var changes = []

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

	TooltipControl.prototype.receiveClick = function receiveClick (event) {
		var clickedElement = event.target
		if (clickedElement.tagName == "TD") {
			var row = clickedElement.parentNode
			if (row.classList.contains("unitGroup")) {
				displayTooltip([getUnitById(row.id)], lastClick)
			}
		} else if (clickedElement.tagName == "TR") {
			if (clickedElement.classList.contains("unitGroup")) {
				displayTooltip([getUnitById(clickedElement.id)], lastClick)
			}
		}
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
			source: movesSource
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


// Prompt dialog
var dialogPromptUser = new Dialog()
var dialogPromptPassword = new Dialog()

var nextTurnChange = null
var isUsersTurn = false

function getTurnManagerContent() {
	var nextTurnString = "never"
	if (nextTurnChange != null) {
		nextTurnString = `${Math.round((nextTurnChange-(new Date()).getTime())/1000)}s`
	}
	var disabledString = ""
	if (!isUsersTurn) {
		disabledString = " disabled"
	}
	return `Next turn: ${nextTurnString}<br/><button id="endTurnButton" type='button'${disabledString}>End Turn</button>`
}

// Turn change overlay
var turnManager = new Overlay({
	closeBox: false,
	className: "turn-change overlay",
	content: getTurnManagerContent()
})

map.addControl(turnManager)

var turnTimer

var turnTimeButton


var units = []


var url = "test.json";
var started = false;

var selectedUnit = null
var username
var password

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

function moveUnit(unit, loc) {
	unit.loc = loc
	updateZoom();
}

function moveCommand(unit, loc) {
	var origLoc = unit.loc
	movesSource.addFeature(new Feature(new LineString([
		origLoc,
		loc
	])))
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
		selectedUnit = unit
		tooltipTable.innerHTML = `
		<tr class="tooltipHeader">
			<th>${unit.type}</th>
		</tr>
		`
		for (var prop in unit.properties) {
			tooltipTable.innerHTML += `
			<tr class="singleUnit">
				<td>${prop}</td>
				<td>${unit.properties[prop]}</td>
			</tr>
			`
		}
	} else {
		tooltipTable.innerHTML = `
		<tr class="tooltipHeader">
			<th>Unit Group</th>
		</tr>
		`
		for (var unit of units) {
			tooltipTable.innerHTML += `
			<tr id=${unit.id} class="unitGroup">
				<td>${unit.type}</td>
				<td>${unit.properties.Size}</td>
			</tr>
			`
		}
	}
}

function hideTooltip() {
	tooltip.style.cssText = 'display:none;'
	selectedUnit = null
}

map.on('click', function (event) {
	var unitsUnder = getUnitsAt(event.pixel)
	if (unitsUnder.length != 0) {
		displayTooltip(unitsUnder, event.pixel)
		lastClick = event.pixel
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
	var gridWidth
	if (zoom > 12) {
		gridWidth = 1000
	} else if (zoom > 11) {
		gridWidth = 2000
	} else if (zoom > 10) {
		gridWidth = 5000
	} else if (zoom > 9) {
		gridWidth = 10000
	} else if (zoom > 8) {
		gridWidth = 20000
	} else if (zoom > 7) {
		gridWidth = 30000
	} else if (zoom > 6) {
		gridWidth = 50000
	} else {
		gridWidth = 150000
	}
	setGraticuleWidth((Math.exp(zoom-5)-1)/20000)
	var unitGroups = new Object()
	vectorSource.clear()
	for (var unit of units) {
		unit.updateZoom(gridWidth)
		var x = unit.visualLoc[0].toString()
		var y = unit.visualLoc[1].toString()
		if (unitGroups[y]) {
			if (unitGroups[y][x]) {
				unitGroups[y][x].addUnit(unit)
			} else {
				unitGroups[y][x] = new UnitGroup(unit)
				unit.display()
			}
		} else {
			unitGroups[y] = new Object()
			unitGroups[y][x] = new UnitGroup(unit)
			unit.display()
		}
	}
}


function rightClick(e) {
	e.preventDefault()
	var loc = map.getCoordinateFromPixel([e.clientX, e.clientY])
	if (selectedUnit) {
		if (username == "admin") {
			moveUnit(selectedUnit, loc)
		} else {
			moveCommand(selectedUnit, loc)
		}
		changes.push({type: "move", unitId: selectedUnit.id, newLocation: loc})
		hideTooltip()
	} else {
		if (username == "admin") {
			var unit = addUnit(loc)
			var rawUnit = unit.toRaw()
			changes.push({type: "add", unit: rawUnit})
		}
	}
}

function getUnitById(id) {
	for (var unit of units) {
		if (unit.id == id) {
			return unit
		}
	}
}

function handleResponse() {
	if (this.readyState == 4 && this.status == 200) {
		var responseJSON = JSON.parse(this.responseText)
		var error = responseJSON.error
		if (error) {
			console.log(error)
			alert(`Error: ${error}`)
			if (error == "Wrong password") {
				clearInterval(repeatSync)
				login()
			}
		} else {
			var mapJSON = responseJSON.mapState
			units = []
			vectorSource.clear()
			for (var rawUnit of mapJSON.units) {
				addUnit(rawUnit.loc, rawUnit.id, rawUnit.type, rawUnit.properties)
			}
			if (username != "admin") {
				nextTurnChange = responseJSON.nextTurnChange
				isUsersTurn = responseJSON.isCorrectTurn
				clearTimeout(turnTimer)
				var d = new Date()
				var timeToChange = nextTurnChange-d.getTime()
				// console.log(`time to change: ${timeToChange}ms`)
				turnTimer = setTimeout(turnChange, timeToChange)
				if (syncNeedsRestarting) {
					syncNeedsRestarting = false
					repeatSync = setInterval(sync, 1000)
					// console.log(`restarting sync. ${timeToChange}`)
				}
			}
		}
	}
}
var syncNeedsRestarting = false

function sync() {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = handleResponse
	xmlhttp.open("POST", "server.js", true)
	xmlhttp.setRequestHeader("Content-Type", "application/json")
	var requestData = {
		requestType: "sync",
		changes: [],
		username: username,
		password: password
	}
	if (username == "admin") {
		requestData.changes = changes
		changes = []
	}
	xmlhttp.send(JSON.stringify(requestData));
}

function turnChange() {
	clearInterval(repeatSync)
	// console.log("Starting turn change")
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = handleResponse
	xmlhttp.open("POST", "server.js", true)
	xmlhttp.setRequestHeader("Content-Type", "application/json")
	var requestData = {
		requestType: "turnChange",
		changes: changes,
		username: username,
		password: password
	}
	changes = []
	xmlhttp.send(JSON.stringify(requestData));
	syncNeedsRestarting = true
	movesSource.clear()
}

login()

var repeatSync

var turnTimeUpdater

function updateTurnTime() {
	turnManager.setContent(getTurnManagerContent())
	document.getElementById("endTurnButton").onclick = endTurnEarly
}

function endTurnEarly() {
	clearTimeout(turnTimer)
	turnChange()
}

function start() {
	sync();
	if (username == "admin") {
		turnTimeButton = new Button ({
			html: '<i class="material-icons">av_timer</i>',
			className: "turnTime",
			title: "Set turn time",
			handleClick: function() {
				var time = prompt("New turn time (per user) in seconds: ", "60")
				changes.push({type: "setTurnTime", time: parseInt(time)})
			}
		});
		map.addControl(turnTimeButton);
	}
	turnTimeUpdater = setInterval(updateTurnTime, 500)
	repeatSync = setInterval(sync, 1000)
}

function login() {
	dialogPromptUser.setContent({
		content: 'If you are reading this then contact an admin to log you in.<br/>username:<input class="usernameValue" autofocus/>',
		title: 'Login',
		buttons:{submit:'Submit'}
	})
	dialogPromptUser.on('button', function (e) {
		if (e.button === 'submit') {
			username = e.inputs['usernameValue'].value

			dialogPromptPassword.show()
			document.getElementById("passwordInput").focus()
		}
	})

	dialogPromptPassword.setContent({
		content: 'If you are reading this then contact an admin to log you in.<br/>password:<input type="password" id="passwordInput" class="passwordValue" autofocus/>',
		title: 'Login',
		buttons:{submit:'Submit', cancel:'Cancel'}
	})
	dialogPromptPassword.on('button', function (e) {
		password = e.inputs['passwordValue'].value

		start()
	})

	map.addControl(dialogPromptUser)
	map.addControl(dialogPromptPassword)

	dialogPromptUser.show()
}
