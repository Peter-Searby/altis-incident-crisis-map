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


var oldPoint = new Point([2807000, 4852600]);
var newPoint = new Point([2807000, 4852600]);


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
	vc.drawGeometry(newPoint);
	map.render();
});



map.on('pointermove', function (event) {
    // var pixel = map.getEventPixel(evt.originalEvent);
});

function request() {
	if (vc) {
		fetch(url).then(function(response) {
		  	response.text().then(function(text) {
		  	  	var json = JSON.parse(text);
		  	  	newPoint = new Point(json["test-point"]);
		  });
		});
	}
}


map.render();
var timer = setInterval(request, 1000);

map.on('dblclick', function (event) {
	clearInterval(timer);
});


map.on('click', function (event) {
	var xmlhttp = new XMLHttpRequest();

    // xmlhttp.onreadystatechange = function() {
    //     if (this.readyState == 4 && this.status == 200) {
    //         console.log(this.responseText)
    //    }
    // };
	xmlhttp.open("POST", "server.js", true)
	xmlhttp.setRequestHeader("Content-Type", "application/json")
	xmlhttp.send(JSON.stringify({point: event.coordinate}));
})
