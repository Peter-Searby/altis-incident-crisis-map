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


var point = new Point([2807000, 4852600]);



var width = window.innerWidth
|| document.documentElement.clientWidth
|| document.body.clientWidth;

var height = window.innerHeight
|| document.documentElement.clientHeight
|| document.body.clientHeight;
map.setSize([width, height*0.98])
map.on('postcompose', function(event) {
  var vectorContext = event.vectorContext;
  // var frameState = event.frameState;
  // var theta = 2 * Math.PI * frameState.time / omegaTheta;
  // var coordinates = [];
  // var i;
  // for (i = 0; i < n; ++i) {
	// var t = theta + 2 * Math.PI * i / n;
	// var x = (R + r) * Math.cos(t) + p * Math.cos((R + r) * t / r);
	// var y = (R + r) * Math.sin(t) + p * Math.sin((R + r) * t / r);
	// coordinates.push([x, y]);
  // }
  // vectorContext.setStyle(imageStyle);
  // vectorContext.drawGeometry(new MultiPoint(coordinates));

  vectorContext.setStyle(pointStyle)
  vectorContext.drawGeometry(point);
  map.render();
});



map.on('pointermove', function (event) {
    var pixel = map.getEventPixel(evt.originalEvent);
});

map.render();
