import Map from 'ol/Map.js';
import View from 'ol/View.js';
import {MultiPoint, Point, LineString, Circle, Polygon} from 'ol/geom.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import {Circle as CircleStyle, Fill, Stroke, Style} from 'ol/style.js';
import Text from 'ol/style/Text';
import Feature from 'ol/Feature';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import WKT from 'ol/format/WKT';
import {defaults as defaultControls, Control} from 'ol/control.js';
import {defaults as defaultInteractions} from 'ol/interaction.js';
import Graticule from 'ol-ext/control/Graticule.js';
import {toLonLat} from 'ol/proj.js';
import Button from 'ol-ext/control/Button.js';
import Dialog from 'ol-ext/control/Dialog.js';
import Overlay from 'ol-ext/control/Overlay.js';
import Notification from 'ol-ext/control/Notification.js';
import convexHull from 'ol-ext/geom/ConvexHull.js';
const jsts = require('jsts');


// OpenLayers
var map;
var vectorSource, movesSource, moveCircleSource, fogSource;
var turnManager;
var tooltipElement, graticule;
var dialogPromptUser, dialogPromptPassword, notification, turnTimeButton;
var fogFeature;

var selectedUnit;

var nextTurnChange, isUsersTurn, lastClick, changes, started, syncNeedsRestarting;
var mapMinX, mapMinY, mapMaxX, mapMaxY;
var units, unitTypes, usersList;
var tooltipLocation;
var url;

var turnTimer, repeatSync, turnTimeUpdater;

var username
var password

var TooltipControl;

var width = window.innerWidth
|| document.documentElement.clientWidth
|| document.body.clientWidth;

var height = window.innerHeight
|| document.documentElement.clientHeight
|| document.body.clientHeight;

// Styles

var pointStyle = new Style({
	image: new CircleStyle({
		radius: 20,
		fill: new Fill({color: 'blue'}),
		stroke: new Stroke({color: 'black', width: 1})
	})
});


// Classes

class Unit {
	constructor(loc, id, type, user, properties) {
		this.feature = new Feature(new Point(loc));
		this.feature.setId(id);
		this.feature.setStyle(pointStyle);
		this.loc = loc;
		this.type = type;
		this.user = user;
		this.properties = properties;
		this.display();
		this.moveFeature = null;
		this.seen = false;
	}

	toRaw() {
		return {
			id: this.feature.getId(),
			loc: this.loc,
			type: this.type,
			user: this.user,
			properties: this.properties
		};
	}

	get id() {
		return this.feature.getId();
	}

	get visualLoc() {
		return this.feature.getGeometry().getCoordinates();
	}

	updateZoom(gridWidth){
		this.feature.getGeometry().setCoordinates([
			Math.round(this.loc[0]/gridWidth)*gridWidth,
			Math.round(this.loc[1]/gridWidth)*gridWidth]
		);
	}

	hide() {
		if (vectorSource.hasFeature(this.feature)){
			vectorSource.removeFeature(this.feature);
		}
	}

	display() {
		vectorSource.addFeature(this.feature);
	}
}

class UnitGroup {
	constructor(unit) {
		this.units = [unit];
		this.feature = unit.feature;
	}

	addUnit(unit) {
		if (this.units.length == 1) {
			this.units[0].hide();
			this.feature = new Feature(new Point(unit.visualLoc));
			this.feature.setStyle(pointStyle);
			vectorSource.addFeature(this.feature);
		}

		this.units.push(unit);
		unit.hide();
	}
}

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

	if (Control) TooltipControl.__proto__ = Control;

	TooltipControl.prototype = Object.create(Control && Control.prototype);
	TooltipControl.prototype.constructor = TooltipControl;

	TooltipControl.prototype.receiveClick = function receiveClick(event) {
		var clickedElement = event.target;

		if (clickedElement.tagName == "TD") {
			var row = clickedElement.parentNode;

			if (row.classList.contains("unitGroup")) {
				displayTooltip([getUnitById(row.id)], lastClick);
			}
		} else if (clickedElement.tagName == "TR") {
			if (clickedElement.classList.contains("unitGroup")) {
				displayTooltip([getUnitById(clickedElement.id)], lastClick);
			}
		}

		if (clickedElement.id == "createUnitButton") {
			var unitType = document.getElementById("typeEntry").value;
			var user = document.getElementById("userEntry").value;

			createUnit(tooltipLocation, unitType, user);
			hideTooltip();
		}
	};

	return TooltipControl;
}(Control));


// Map setup

vectorSource = new VectorSource();
movesSource = new VectorSource();
moveCircleSource = new VectorSource();
fogSource = new VectorSource();

map = new Map({
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
			source: moveCircleSource
		}),
		new VectorLayer({
			source: movesSource
		}),
		new VectorLayer({
			source:fogSource
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


graticule = new Graticule({
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
dialogPromptUser = new Dialog()
dialogPromptPassword = new Dialog()


// Notification Control
notification = new Notification({})
map.addControl(notification)

// Fog
fogFeature = new Feature(new Polygon([[0,0]]))
fogFeature.setStyle(new Style({fill: new Fill({color: [0, 0, 0, 0.8]})}))
fogSource.addFeature(fogFeature)

nextTurnChange = null
isUsersTurn = false


// Map bounds
mapMinX = 0
mapMinY = 0
mapMaxX = 5000000
mapMaxY = 6000000


lastClick = null;
changes = [];

tooltipElement = document.getElementById('tooltip');


function getTurnManagerContent() {
	var nextTurnString = "never";

	if (nextTurnChange != null) {
		nextTurnString = `${Math.round((nextTurnChange-(new Date()).getTime())/1000)}s`;
	}

	var disabledString = "";

	if (!isUsersTurn) {
		disabledString = " disabled";
	}

	return `Next turn: ${nextTurnString}<br/>
		<button id="endTurnButton" type='button'${disabledString}>
			End Turn
		</button>`;
}

// Turn change overlay
turnManager = new Overlay({
	closeBox: false,
	className: "turn-change overlay",
	content: getTurnManagerContent()
});

map.addControl(turnManager);


// Data stuff

units = [];

url = "test.json";
started = false;

tooltipLocation = null;
selectedUnit = null;

document.getElementById('map').oncontextmenu = rightClick;

map.setSize([width, height*0.98]);
map.on('postcompose', function(event) {map.render()});
map.render();

updateZoom();

function onUnitsChange() {
	var pointsOfBounds = [
		[mapMinX, mapMinY],
		[mapMaxX, mapMinY],
		[mapMaxX, mapMaxY],
		[mapMinX, mapMaxY],
		[mapMinX, mapMinY]
	];
	var cutouts = [];
	for (var unit of units) {
		if (unit.user == username) {
			var r = parseInt(unit.properties["Vision"]);
			var p = unit.loc[0] / 1000;
			var q = unit.loc[1] / 1000;

			var pts = [];
			for (var x of [...Array(2*(r+2)).keys()].map(i => i - r-2 + p)) {
				for (var y of [...Array(2*(r+1)).keys()].map(i => i - r-1 + q)) {
					if (r ** 2 >= (x-p) ** 2 + (y-q) ** 2) {
						pts.push([x*1000,y*1000]);
					}
				}
			}
			var cH = convexHull(pts);

			var str = "POLYGON ((";
			for (var coord of cH) {
				str+=`${coord[0]} ${coord[1]}, `;
			}
			str+= `${pts[0][0]} ${pts[0][1]}))`;

			cutouts.push(str);
		}
	}

	var wkt = new WKT();

	var reader = new jsts.io.WKTReader();
	var writer = new jsts.io.WKTWriter();

	var cutoutsMerged = [];
	for (var i in cutouts) {
		cutouts[i] = reader.read(cutouts[i]);

		if (cutoutsMerged.length == 0) {
			cutoutsMerged.push(cutouts[i]);
		} else {
			var lastMerge = -1;

			for (var j in cutoutsMerged) {
				if (cutoutsMerged[j] != null) {
					if (!cutouts[i].intersection(cutoutsMerged[j]).isEmpty()) {
						if (lastMerge != -1) {
							cutoutsMerged[lastMerge] = cutoutsMerged[j].union(cutoutsMerged[lastMerge].union(cutouts[i]));
							cutoutsMerged[j] = null;
						} else {
							cutoutsMerged[j] = cutoutsMerged[j].union(cutouts[i]);
							lastMerge = j;
						}
					}
				}
			}

			if (lastMerge == -1) {
				cutoutsMerged.push(cutouts[i]);
			}
		}
	}

	for (var i in cutoutsMerged) {
		if (cutoutsMerged[i] != null) {
			cutoutsMerged[i] = writer.write(cutoutsMerged[i]);
			cutoutsMerged[i] = wkt.readGeometry(cutoutsMerged[i]);
			cutoutsMerged[i] = cutoutsMerged[i].getCoordinates()[0];
		} else {
			cutoutsMerged[i] = [];
		}
	}

	fogFeature.setGeometry(new Polygon([pointsOfBounds, ...cutoutsMerged]));
}

function roundLocation(loc) {
	return [Math.round(loc[0]/1000)*1000, Math.round(loc[1]/1000)*1000];
}

function addUnit(loc, id, type, user, properties) {
	var unit;
	var originalUnit = getUnitById(id);

	if (id == undefined) {
		if (units) {
			id = units[units.length-1].id+1;
		} else {
			id = 0;
		}
	}

	loc = roundLocation(loc);

	if (type == undefined) {
		type = defaultUnitType;
	}

	if (properties == undefined) {
		properties = defaultUnitProperties;
	}

	if (originalUnit != null) {
		unit = originalUnit;
		unit.loc = loc;
	} else {
		unit = new Unit(loc, id, type, user, properties);
		units.push(unit);
	}
	unit.seen = true;
	vectorSource.addFeature(unit.feature);
	updateZoom();
	return unit;
}

function moveUnit(unit, loc) {
	unit.loc = loc;
	updateZoom();
}

function moveCommand(unit, loc) {
	if (unit.moveFeature) {
		movesSource.removeFeature(unit.moveFeature);
	}

	var f = new Feature(new LineString([
		unit.loc,
		loc
	]));
	movesSource.addFeature(f);

	unit.moveFeature = f;
}

function getUnitFromFeature(feature) {
	for (var unit of units) {
		if (unit.feature == feature) {
			return unit;
		}
	}
	throw "Can't find unit with requested feature";
}

function getUnitsAt(pixel) {
	var foundUnits = [];
	for (var unit of units) {
		var unitPixel = map.getPixelFromCoordinate(unit.visualLoc);
		var distance = Math.hypot(unitPixel[0]-pixel[0]-15*unitPixel[0]/width, unitPixel[1] - pixel[1]-4*unitPixel[1]/height);
		if (distance<22) {
			foundUnits.push(unit);
		}
	}
	return foundUnits;
}

function displayMoveCircle(unit) {
	if (unit.user == username) {
		var rad = parseInt(unit.properties["Speed"])*1000;
		moveCircleSource.clear();
		var moveCircleFeature = new Feature(new Circle(unit.loc, rad));
		moveCircleSource.addFeature(moveCircleFeature);
	}
}


function displayTooltip(units, pixel) {
	tooltipElement.style.cssText = `
	position: absolute;
	background-color: white;
	top: ${pixel[1]}px;
	left: ${pixel[0]}px;
	display:block;
	`;
	var tooltipTable = document.getElementById("tooltipTable");
	if (units.length == 1) {
		var unit = units[0];
		if (selectedUnit != unit) {
			displayMoveCircle(unit);
			selectedUnit = unit;
		}
		tooltipTable.innerHTML = `
		<tr class="tooltipHeader">
			<th>${unit.type}</th>
		</tr>
		<tr>
		<td style="font-style: italic">${unit.user}</td>
		</tr>
		`;
		for (var prop in unit.properties) {
			tooltipTable.innerHTML += `
			<tr class="singleUnit">
				<td>${prop}</td>
				<td>${unit.properties[prop]}</td>
			</tr>
			`;
		}
	} else {
		if (selectedUnit != null) {
			selectedUnit = null;
		}
		tooltipTable.innerHTML = `
		<tr class="tooltipHeader">
			<th>Unit Group</th>
		</tr>
		`;
		for (var unit of units) {
			tooltipTable.innerHTML += `
			<tr id=${unit.id} class="unitGroup">
				<td>${unit.type}</td>
				<td style="font-style: italic">${unit.user}</td>
			</tr>
			`;
		}
	}
}

function createUnit(loc, type, user) {
	changes.push({type: "add", loc: loc, unitType: type, user: user});
}

function displayRightTooltip(pixel) {
	tooltipElement.style.cssText = `
	position: absolute;
	background-color: white;
	top: ${pixel[1]}px;
	left: ${pixel[0]}px;
	display:block;
	`;
	var tooltipTable = document.getElementById("tooltipTable");
	 var str = `
	<tr class="tooltipHeader">
		<th>New Unit</th>
	</tr><tr>
		<td>type:</td><td><select id="typeEntry">
	`;
	for (var type of unitTypes) {
		str += `<option value="${type}">${type}</option>`;
	}

	str += `
		</select></td>

	</tr><tr>
		<td>type:</td><td><select id="userEntry">
	`;
	for (var user of usersList) {
		str += `<option value="${user}">${user}</option>`;
	}

	str += `
		</select></td>
	</tr><tr>
		<td/><td><button type="button" id="createUnitButton"/>Create</td>
	</tr>
	`;
	tooltipTable.innerHTML = str;
}

function hideTooltip() {
	tooltipElement.style.cssText = 'display:none;';
	selectedUnit = null;
	moveCircleSource.clear();
}

function updateTooltip() {
	if (selectedUnit != null) {
		 displayTooltip([selectedUnit], map.getPixelFromCoordinate(selectedUnit.loc));
	}
}

map.on('click', function (event) {
	var unitsUnder = getUnitsAt(event.pixel);
	if (unitsUnder.length != 0) {
		displayTooltip(unitsUnder, event.pixel);
		lastClick = event.pixel;

	} else {
		hideTooltip();
	}
});

map.on('moveend', function (event) {
	updateZoom();
	updateTooltip();
});

function updateZoom() {
	var gridWidth;
	function setGraticuleWidth(width) {
		graticule.setStyle(new Style({
			stroke: new Stroke({
				color: ['black'],
				width: width,
			})
		}));
	}

	var zoom = map.getView().getZoom();

	if (zoom > 12) {
		gridWidth = 1000;
	} else if (zoom > 11) {
		gridWidth = 2000;
	} else if (zoom > 10) {
		gridWidth = 5000;
	} else if (zoom > 9) {
		gridWidth = 10000;
	} else if (zoom > 8) {
		gridWidth = 20000;
	} else if (zoom > 7) {
		gridWidth = 30000;
	} else if (zoom > 6) {
		gridWidth = 50000;
	} else {
		gridWidth = 150000;
	}
	setGraticuleWidth((Math.exp(zoom-5)-1)/20000);
	var unitGroups = new Object();
	vectorSource.clear();
	for (var unit of units) {
		unit.updateZoom(gridWidth);
		var x = unit.visualLoc[0].toString();
		var y = unit.visualLoc[1].toString();
		if (unitGroups[y]) {
			if (unitGroups[y][x]) {
				unitGroups[y][x].addUnit(unit);
			} else {
				unitGroups[y][x] = new UnitGroup(unit);
				unit.display();
			}
		} else {
			unitGroups[y] = new Object();
			unitGroups[y][x] = new UnitGroup(unit);
			unit.display();
		}
	}
}


function rightClick(e) {
	e.preventDefault();
	var loc = roundLocation(map.getCoordinateFromPixel([e.clientX, e.clientY]));
	if (selectedUnit != null) {
		var u = selectedUnit;
		var allowed = false;
		if (username == "admin") {
			moveUnit(selectedUnit, loc);
			hideTooltip();
			allowed = true;
		} else {
			var inRange = Math.hypot(
				loc[0] - selectedUnit.loc[0],
				loc[1] - selectedUnit.loc[1]
			) <= parseInt(selectedUnit.properties["Speed"])*1000;

			if (inRange && selectedUnit.user == username) {
				allowed = true;
				moveCommand(selectedUnit, loc);
			}
			if (!inRange) {
				notification.show(`Units can only travel as far as their speed (km) each turn`);
			}
			if (selectedUnit.user != username) {
				notification.show(`This is not your unit`);
			}
		}
		if (allowed) {
			changes.push({type: "move", unitId: u.id, newLocation: loc});
		}
	} else {
		if (username == "admin") {
			tooltipLocation = loc;
			displayRightTooltip([e.clientX, e.clientY]);
		}
	}
}

function getUnitById(id) {
	for (var unit of units) {
		if (unit.id == id) {
			return unit;
		}
	}
	return null;
}

function handleResponse() {
	if (this.readyState == 4 && this.status == 200) {
		var responseJSON = JSON.parse(this.responseText);
		var error = responseJSON.error;
		if (username == "admin"){
			if (responseJSON.unitTypes) {
				unitTypes = responseJSON.unitTypes;
			}
			if (responseJSON.usersList) {
				usersList = responseJSON.usersList;
			}
		}
		if (error) {
			console.log(error);
			alert(`Error: ${error}`);
			if (error == "Wrong password") {
				clearInterval(repeatSync);
				login();
			}
		} else {
			var mapJSON = responseJSON.mapState;
			vectorSource.clear();
			for (var unit of units) {
				unit.seen = false;
			}
			for (var rawUnit of mapJSON.units) {
				addUnit(rawUnit.loc, rawUnit.id, rawUnit.type, rawUnit.user, rawUnit.properties);
			}

			for (var unit of units) {
				if (!unit.seen) {
					units.splice(units.indexOf(unit), 1);
				}
			}
			if (username != "admin") {
				nextTurnChange = responseJSON.nextTurnChange;
				isUsersTurn = responseJSON.isCorrectTurn;
				clearTimeout(turnTimer);
				var d = new Date();
				var timeToChange = nextTurnChange-d.getTime();

				turnTimer = setTimeout(turnChange, timeToChange);
				if (syncNeedsRestarting) {
					syncNeedsRestarting = false;
					repeatSync = setInterval(sync, 1000);
				}
				if (responseJSON.anyChanges) {
					onUnitsChange();
				}
			}
		}
	}
}

syncNeedsRestarting = false;

function sync() {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = handleResponse;
	xmlhttp.open("POST", "server.js", true);
	xmlhttp.setRequestHeader("Content-Type", "application/json");
	var requestData = {
		requestType: "sync",
		changes: [],
		username: username,
		password: password
	};
	if (username == "admin") {
		requestData.changes = changes;
		changes = [];
	}
	xmlhttp.send(JSON.stringify(requestData));
}

function turnChange() {
	clearInterval(repeatSync);

	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = handleResponse;
	xmlhttp.open("POST", "server.js", true);
	xmlhttp.setRequestHeader("Content-Type", "application/json");
	var requestData = {
		requestType: "turnChange",
		changes: changes,
		username: username,
		password: password
	};
	changes = [];
	xmlhttp.send(JSON.stringify(requestData));
	syncNeedsRestarting = true;
	movesSource.clear();
	moveCircleSource.clear();
	hideTooltip();
	for (var unit of units) {
		unit.moveFeature = null;
	}
}

login();

function updateTurnTime() {
	turnManager.setContent(getTurnManagerContent());
	document.getElementById("endTurnButton").onclick = endTurnEarly;
}

function endTurnEarly() {
	clearTimeout(turnTimer);
	turnChange();
}

function start() {
	sync();

	if (username == "admin") {
		turnTimeButton = new Button({
			html: '<i class="material-icons">av_timer</i>',
			className: "turnTime",
			title: "Set turn time",
			handleClick: function() {
				var time = prompt("New turn time (per user) in seconds: ", "60");
				changes.push({type: "setTurnTime", time: parseInt(time)});
			}
		});

		map.addControl(turnTimeButton);
	}

	turnTimeUpdater = setInterval(updateTurnTime, 500);
	repeatSync = setInterval(sync, 1000);

	// Title
	var turnManager = new Overlay({
		closeBox: false,
		className: "title",
		content: username
	});

	map.addControl(turnManager);
}

function login() {
	dialogPromptUser.setContent({
		content: 'If you are reading this then contact an admin to log you in.<br/>username:<input class="usernameValue" autofocus/>',
		title: 'Login',
		buttons:{submit:'Submit'}
	});
	dialogPromptUser.on('button', function (e) {
		if (e.button === 'submit') {
			username = e.inputs['usernameValue'].value;

			dialogPromptPassword.show();
			document.getElementById("passwordInput").focus();
		}
	});

	dialogPromptPassword.setContent({
		content: 'If you are reading this then contact an admin to log you in.<br/>password:<input type="password" id="passwordInput" class="passwordValue" autofocus/>',
		title: 'Login',
		buttons:{submit:'Submit', cancel:'Cancel'}
	});
	dialogPromptPassword.on('button', function (e) {
		password = e.inputs['passwordValue'].value;

		start();
	});

	map.addControl(dialogPromptUser);
	map.addControl(dialogPromptPassword);

	dialogPromptUser.show();
}
