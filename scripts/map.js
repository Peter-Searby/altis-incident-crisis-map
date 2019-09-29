import Map from 'ol/Map.js';
import View from 'ol/View.js';
import {MultiPoint, Point, LineString, Circle, Polygon} from 'ol/geom.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import {Circle as CircleStyle, Fill, Stroke, Style, Icon} from 'ol/style.js';
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
const StatsManager = require('./stats').StatsManager;
const SEA_COLOUR = [182, 210, 236];
const SEA = 1;
const LAND = 2;


// OpenLayers
var map;
var unitSource, movesSource, attacksSource, moveCircleSource, fogSource;
var turnManager;
var tooltipElement, graticule;
var dialogPromptUser, dialogPromptPassword, notification, turnTimeButton, deploymentFinishButton, resetMapButton;
var fogFeature;

var selectedUnit, attackingUnit;

var nextTurnChange, isUsersTurn, lastClick, changes, started, syncNeedsRestarting, justStarted, attacking, gameStarted;
var mapMinX, mapMinY, mapMaxX, mapMaxY;
var units, usersList;
var tooltipLocation;
var url;

var turnTimer, repeatSync, turnTimeUpdater;

var username;
var password;

var statsManager;
var TooltipControl;

var width = window.innerWidth
|| document.documentElement.clientWidth
|| document.body.clientWidth;

var height = window.innerHeight
|| document.documentElement.clientHeight
|| document.body.clientHeight;

function distance(vector1, vector2) {
	var mainVector = vector1;
	if (vector1.length > vector2.length) {
		mainVector = vector2;
	}
	var total = 0.0;
	for (var i in mainVector) {
		total += (vector1[i]-vector2[i]) ** 2;
	}
	return Math.sqrt(total);
}


// Styles

var pointStyle = new Style({
	image: new CircleStyle({
		radius: 20,
		fill: new Fill({color: 'blue'}),
		stroke: new Stroke({color: 'black', width: 1})
	})
});

var graticuleStyle = new Style({
	stroke: new Stroke({
		width: 0.3,
		color: ['black']
	})
});

var userColours = [
	[25, 75, 255],
	[255, 0, 0]
];

var isThisFirstOfEvent = {
	'move': true,
	'attack': true
}

function isFirst(e) {
	if (isThisFirstOfEvent[e]) {
		isThisFirstOfEvent[e] = false;
		return true;
	} else {
		return false;
	}
}

function unitStyleGenerator(type, user) {
	return new Style({
		image: new Icon({
			src: `../res/units/${type}.svg`,
			scale: 0.25,
			color: userColours[usersList.indexOf(user)]
		})
	});
}


// Classes

class Unit {
	constructor(loc, id, type, user, deployTime, hp) {
		this.feature = new Feature(new Point(loc));
		this.feature.setId(id);
		this.feature.setStyle(unitStyleGenerator(type, user));
		this.loc = loc;
		this.type = type;
		this.user = user;
		this.properties = statsManager.getProperties(type);
		this.display();
		this.moveFeature = null;
		this.attackFeature = null;
		this.seen = false;
		this.deployTime = deployTime;
		this.moveDistance = 0.0;
		this.visualLoc = roundLocation(loc);
		this.hp = hp;
	}

	toRaw() {
		return {
			id: this.feature.getId(),
			loc: this.loc,
			type: this.type,
			user: this.user,
			properties: this.properties,
			deployTime: this.deployTime,
			hp: this.hp
		};
	}

	get id() {
		return this.feature.getId();
	}

	updateZoom(gridWidth){
		this.feature.setGeometry(new Point(this.loc));
		this.visualLoc = roundLocationBy(this.loc, gridWidth)
	}

	hide() {
		if (unitSource.hasFeature(this.feature)){
			unitSource.removeFeature(this.feature);
		}
	}

	display() {
		unitSource.addFeature(this.feature);
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
			unitSource.addFeature(this.feature);
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

		switch (clickedElement.tagName) {
			case "TD":
				var row = clickedElement.parentNode;

				if (row.classList.contains("unitGroup")) {
					displayTooltip([getUnitById(row.id)], lastClick);
				}
				break;
			case "TR":
				if (clickedElement.classList.contains("unitGroup")) {
					displayTooltip([getUnitById(clickedElement.id)], lastClick);
				}
				break;
			default:
				break;
		}

		switch (clickedElement.id) {
			case "createUnitButton":
				var unitType = document.getElementById("typeEntry").value;
				var user = document.getElementById("userEntry").value;

				createUnit(tooltipLocation, unitType, user);
				hideTooltip();
				break;
			case "deleteUnitButton":
				var unitId = selectedUnit.id;
				changes.push({type:"delete", unitId: unitId});
				hideTooltip();
				break;
			case "attackButton":
				startAttacking();
				hideTooltip();
				if (isFirst('attack')) {
					notification.show("To choose a unit to attack, left click the desired unit");
				}
				break;
			case "cancelAttackButton":
				if (selectedUnit.attackFeature != null && attacksSource.hasFeature(selectedUnit.attackFeature)){
					attacksSource.removeFeature(selectedUnit.attackFeature);
				}
				selectedUnit.attackFeature = null;
				deleteAnyOldAttacks(selectedUnit.id);
				displayTooltip([selectedUnit], lastClick)
				break;
			default:
				break;
		}
	};

	return TooltipControl;
}(Control));


// Map setup


// Map bounds
mapMinX = 1000000;
mapMinY = 3460000;
mapMaxX = 4000000;
mapMaxY = 7200000;

unitSource = new VectorSource();
movesSource = new VectorSource();
attacksSource = new VectorSource();
moveCircleSource = new VectorSource();
fogSource = new VectorSource();

tooltipElement = document.getElementById('tooltip');

map = new Map({
	controls: defaultControls().extend([
		new TooltipControl()
    ]),
	layers: [
		new TileLayer({
			source: new OSM({
				url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png'
			}),
			extent: [mapMinX, mapMinY, mapMaxX, mapMaxY],
			zIndex: 0
		}),
		new VectorLayer({
			source: moveCircleSource,
			zIndex: 1
		}),
		new VectorLayer({
			source: movesSource,
			style: new Style({
				stroke: new Stroke({
					width: 5,
					color: [150, 180, 240]
				})
			}),
			zIndex: 1
		}),
		new VectorLayer({
			source: attacksSource,
			style: new Style({
				stroke: new Stroke({
					width: 6,
					color: [200, 0, 0]
				})
			}),
			zIndex: 1
		}),
		new VectorLayer({
			source:fogSource,
			zIndex: 1
		}),
		new VectorLayer({
			source: unitSource,
			zIndex: 1
		})
	],
	target: 'map',
	view: new View({
		center: [ 2807000, 4852600 ],
		zoom: 11,
		minZoom: 5,
		maxZoom: 14
	}),
	keyboardEventTarget: document
});


graticule = new Graticule({
	style: graticuleStyle,
	borderWidth: 1,
	step: 1000,
	projection: 'EPSG:3857',
});

graticule.setMap(map)


// Prompt dialog
dialogPromptUser = new Dialog();
dialogPromptPassword = new Dialog();


// Notification Control
notification = new Notification();
map.addControl(notification);

// Fog
fogFeature = new Feature(new Polygon([[0,0]]));
fogFeature.setStyle(new Style({fill: new Fill({color: [0, 0, 0, 0.8]})}));
fogSource.addFeature(fogFeature);

nextTurnChange = null;
isUsersTurn = false;


// Data stuff

units = [];

url = "test.json";
started = false;
attacking = false;

tooltipLocation = null;
selectedUnit = null;

lastClick = null;
changes = [];


function startAttacking() {
	attacking = true;
	attackingUnit = selectedUnit;
}


function getTurnManagerContent() {
	var nextTurnString = "never";

	if (nextTurnChange != null && nextTurnChange != 0) {
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


document.getElementById('map').oncontextmenu = rightClick;
document.addEventListener('keydown', keyDownEvent);
document.addEventListener('keyup', keyUpEvent);

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


function getMapPointType(pixel) {
	return map.forEachLayerAtPixel(pixel, function(layer, colour) {
		if (layer.getZIndex() == 0) {
			var d = distance(colour, SEA_COLOUR);
			if (d < 10) {
				return SEA;
			} else {
				return LAND;
			}
		}
	});
}

function displayMoveCircle(unit) {
	if (unit.user == username) {
		var rad = parseInt(unit.properties["Speed"])*1000;
		moveCircleSource.clear();
		var moveCircleFeature = new Feature(new Circle(unit.loc, rad));
		moveCircleSource.addFeature(moveCircleFeature);
	}
}

// Unit tooltip
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
		// Unit details

		var unit = units[0];
		if (selectedUnit != unit) {
			displayMoveCircle(unit);
			selectedUnit = unit;
		}
		tooltipTable.innerHTML = `
		<tr class="tooltipHeader">
			<th>${unit.type}</th><th>${unit.hp} HP</th>
		</tr>
		<tr>
		<td style="font-style: italic">${unit.user}</td>
		</tr>
		`;

		if (username == "admin" && unit.deployTime > 0) {
			var s;
			if (unit.deployTime == 1) {
				s = "";
			} else {
				s = "s";
			}
			tooltipTable.innerHTML += `
			<tr>
				<td><b>Deploys in ${unit.deployTime} turn${s}</b></td>
			</tr>
			`
		}
		for (var prop in unit.properties) {
			tooltipTable.innerHTML += `
			<tr class="singleUnit">
				<td>${prop}</td>
				<td>${unit.properties[prop]}</td>
			</tr>
			`;
		}
		if (username == "admin") {
			tooltipTable.innerHTML += `
			<tr>
				<td/><td><button type="button" id="deleteUnitButton">Delete</button></td>
			</tr>
			`
		} else if (username == selectedUnit.user){
			var cancelAttackButtonString = "</td>";
			if (selectedUnit.attackFeature) {
				cancelAttackButtonString = `<td><button type="button" id="cancelAttackButton">Cancel attack</button></td>`;
			}

			tooltipTable.innerHTML += `
			<tr>
				${cancelAttackButtonString}<td><button type="button" id="attackButton">Attack</button></td>
			</tr>
			`
		}
	} else {
		// Unit Group

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
	for (var type of statsManager.getTypes()) {
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
		<td/><td><button type="button" id="createUnitButton">Create</button></td>
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

function roundLocation(loc) {
	return [Math.round(loc[0]/1000)*1000, Math.round(loc[1]/1000)*1000];
}

function roundLocationBy(loc, amount) {
	return [Math.round(loc[0]/amount)*amount, Math.round(loc[1]/amount)*amount];
}

function addUnit(loc, id, type, user, deployTime, hp) {
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

	if (originalUnit != null) {
		unit = originalUnit;
		unit.loc = loc;
		unit.deployTime = deployTime
		unit.hp = hp;
	} else {
		unit = new Unit(loc, id, type, user, deployTime, hp);
		units.push(unit);
	}
	unit.seen = true;
	unitSource.addFeature(unit.feature);
	updateZoom();
	return unit;
}

function moveUnit(unit, loc) {
	unit.loc = loc;
	updateZoom();
}

function moveCommand(unit, loc) {
	function inRange(d) {
		return d <= parseInt(unit.properties["Speed"])*1000;
	}
	if (unit.moveFeature) {
		var geo = unit.moveFeature.getGeometry();
		var d = distance(geo.getLastCoordinate(), loc);
		if (inRange(unit.moveDistance+d)) {
			unit.moveDistance+=d;
			geo.appendCoordinate(loc);
			return true;
		}
	} else {
		unit.moveDistance = distance(unit.loc, loc);
		if (inRange(unit.moveDistance)) {
			var f = new Feature(new LineString([
				unit.loc,
				loc
			]));
			movesSource.addFeature(f);

			unit.moveFeature = f;
			return true;
		} else {
			unit.moveDistance = 0;
		}
	}
	return false;
}

function removeMove(unit) {
	if (unit.moveFeature) {
		var geo = unit.moveFeature.getGeometry();
		var coords = geo.getCoordinates();
		if (coords.length >= 2) {
			unit.moveDistance -= distance(coords[coords.length-1], coords[coords.length-2]);
			geo.setCoordinates(coords.slice(0, coords.length-1))
		}
	}
}

function getUnitFromFeature(feature) {
	for (var unit of units) {
		if (unit.feature == feature) {
			return unit;
		}
	}
	throw "Can't find unit with requested feature";
}

function createUnit(loc, type, user) {
	changes.push({type: "add", loc: loc, unitType: type, user: user});
}

function getUnitsAt(pixel) {
	var foundUnits = [];
	for (var unit of units) {
		var unitPixel = map.getPixelFromCoordinate(unit.loc);
		var distance = Math.hypot(unitPixel[0]-pixel[0]-15*unitPixel[0]/width, unitPixel[1] - pixel[1]-4*unitPixel[1]/height);
		if (distance<40) {
			foundUnits.push(unit);
		}
	}
	return foundUnits;
}

function cancelAttack(message) {
	notification.show(message);
	selectedUnit = attackingUnit;
	attacking = false;
	displayTooltip([selectedUnit], map.getPixelFromCoordinate(selectedUnit.loc));
}

function deleteAnyOldAttacks(id) {
	for (var i in changes) {
		if (changes[i].type == "attack" && changes[i].attackerId == id) {
			changes.splice(i, 1);
		}
	}
}


function attemptAttack(defendingUnit) {
	if (attackingUnit.user == username && defendingUnit.user != username) {
		if (distance(attackingUnit.loc, defendingUnit.loc) <= attackingUnit.properties["Attack Range"] * 1000) {
			// Make attack
			deleteAnyOldAttacks(attackingUnit.id);
			changes.push({type: "attack", attackerId: attackingUnit.id, defenderId: defendingUnit.id});
			attacking = false;
			notification.show("Attack planned");
			var f = new Feature(new LineString([
				attackingUnit.loc,
				defendingUnit.loc
			]));
			attacksSource.addFeature(f);

			attackingUnit.attackFeature = f;
		} else {
			cancelAttack("Defending unit out of range");
		}
	} else {
		cancelAttack("You cannot attack your own unit");
	}
}

map.on('click', function (event) {
	var unitsUnder = getUnitsAt(event.pixel);
	if (unitsUnder.length != 0) {
		if (attacking) {
			if (unitsUnder.length == 1) {
				attemptAttack(unitsUnder[0]);
			} else {
				notification.show("Too many units under mouse. Zoom in for greater precision");
			}
		} else {
			displayTooltip(unitsUnder, event.pixel);
			lastClick = event.pixel;
		}
	} else {
		if (attacking) {
			cancelAttack("No unit there");
		} else {
			hideTooltip();
		}
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

	if (zoom >= 13) {
		gridWidth = 1000;
	} else if (zoom >= 12) {
		gridWidth = 2000;
	} else if (zoom >= 11) {
		gridWidth = 6000;
	} else if (zoom >= 10) {
		gridWidth = 12000;
	} else if (zoom >= 9) {
		gridWidth = 30000;
	} else if (zoom >= 8) {
		gridWidth = 40000;
	} else if (zoom >= 7) {
		gridWidth = 80000;
	} else {
		gridWidth = 200000;
	}
	setGraticuleWidth((Math.exp(zoom-4)-1)/20000);
	var unitGroups = new Object();
	unitSource.clear();
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

function validGroundBetween(startLoc, endLoc) {
	var ground;

	startLoc = map.getPixelFromCoordinate(startLoc);
	endLoc = map.getPixelFromCoordinate(endLoc);

	function getSegmentOfLength(p1, p2, l) {
		var totalLength = distance(p1, p2);
		return [(p2[0]-p1[0])*l/totalLength, (p2[1]-p1[1])*l/totalLength]
	}

	var segment = getSegmentOfLength(startLoc, endLoc, 1);
	var point = startLoc;
	while (distance(point, startLoc) < distance(endLoc, startLoc)) {
		ground = getMapPointType(point);

		if ((ground==SEA && 'Land'==selectedUnit.properties["Domain"]) ||
		(ground==LAND && 'Sea'==selectedUnit.properties["Domain"])) {
			return false;
		}
		point = [point[0]+segment[0], point[1]+segment[1]];
	}
	return true;
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

			var validGround = validGroundBetween(selectedUnit.loc, loc);

			if (selectedUnit.user == username && validGround) {
				allowed = moveCommand(selectedUnit, loc);
				if (isFirst('move')) {
					notification.show("You can continue to add moves with a right click. <br/>To remove the last move press Backspace", 5000);
				}
				if (!allowed) {
					notification.show(`Units can only travel as far as their speed (km) each turn`);
				}
			}
			if (selectedUnit.user != username) {
				notification.show(`This is not your unit`);
			}
			if (!validGround) {
				notification.show("This unit cannot move there")
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

function keyDownEvent(event) {
	switch (event.code) {
		case 'Backspace':
			if (selectedUnit != null && selectedUnit.user == username) {
				removeMove(selectedUnit);
			}
			break;
		default:
			return;
	}
}

function keyUpEvent(event) {

}

function getUnitById(id) {
	for (var unit of units) {
		if (unit.id == id) {
			return unit;
		}
	}
	return null;
}

function displayFailedAttacks(attacks) {
	if (attacks.length != 0) {
		notification.show(attacks.pop(), 500);
		setTimeout(displayFailedAttacks, 500, attacks)
	}
}

function handleResponse() {
	if (this.readyState == 4 && this.status == 200) {
		var responseJSON = JSON.parse(this.responseText);
		var error = responseJSON.error;
		if (responseJSON.usersList) {
			usersList = responseJSON.usersList;
		}
		if (error) {
			console.log(error);
			alert(`Error: ${error}`);
			if (error == "Wrong password") {
				clearInterval(repeatSync);
				login();
			}
		} else {
			// Normal response

			var mapJSON = responseJSON.mapState;
			unitSource.clear();
			if (responseJSON.statsData) {
				statsManager = new StatsManager(responseJSON.statsData);
			}


			// Parse units
			for (var unit of units) {
				unit.seen = false;
			}
			for (var rawUnit of mapJSON.units) {
				addUnit(rawUnit.loc, rawUnit.id, rawUnit.type, rawUnit.user, rawUnit.deployTime, rawUnit.hp);
			}

			for (var unit of units) {
				if (!unit.seen) {
					units.splice(units.indexOf(unit), 1);
				}
			}

			if (username != "admin") {
				// Handle user specific syncing
				nextTurnChange = responseJSON.nextTurnChange;
				isUsersTurn = responseJSON.isCorrectTurn;
				clearTimeout(turnTimer);
				if (nextTurnChange != 0) {
					var d = new Date();
					var timeToChange = nextTurnChange-d.getTime();

					turnTimer = setTimeout(turnChange, timeToChange);
					if (syncNeedsRestarting) {
						syncNeedsRestarting = false;
						repeatSync = setInterval(sync, 1000);
					}
				}
				if (responseJSON.anyChanges) {
					onUnitsChange();
				}
				if (responseJSON.failedAttacks) {
					displayFailedAttacks(responseJSON.failedAttacks);
				}
			} else {
				// Handle admin specific syncing
				if (gameStarted != mapJSON.gameStarted) {
					if (mapJSON.gameStarted) {
						map.removeControl(deploymentFinishButton);
					} else {
						map.addControl(deploymentFinishButton);
					}
				}
			}

			gameStarted = mapJSON.gameStarted;
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
	if (justStarted) {
		requestData.firstSync = true;
		justStarted = false;
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
	attacksSource.clear();
	moveCircleSource.clear();
	hideTooltip();
	for (var unit of units) {
		unit.moveFeature = null;
		unit.attackFeature = null;
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
	document.title = "Altis Map - "+username
	justStarted = true;
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

		deploymentFinishButton = new Button({
			html: '<i class="material-icons">timer</i>',
			className: "deploymentFinish",
			title: "End deployment phase",
			handleClick: function() {
				changes.push({type: "startTurnChanging"});
				map.removeControl(deploymentFinishButton);
			}
		});

		resetMapButton = new Button({
			html: '<i class="material-icons">delete_forever</i>',
			className: "resetMap",
			title: "Reset map",
			handleClick: function() {
				changes.push({type: "reset"});
			}
		});

		map.addControl(turnTimeButton);
		map.addControl(resetMapButton);
		gameStarted = true;
	} else {
		gameStarted = false;
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
		if (e.button === 'submit') {
			password = e.inputs['passwordValue'].value;

			start();
		} else if (e.button === 'cancel') {
			login();
			return
		}
	});

	map.addControl(dialogPromptUser);
	map.addControl(dialogPromptPassword);

	dialogPromptUser.show();
}
