

var width = window.innerWidth
|| document.documentElement.clientWidth
|| document.body.clientWidth;

var height = window.innerHeight
|| document.documentElement.clientHeight
|| document.body.clientHeight;

var img;
var timer;

var c;
var ctx;

function init() {
	c = document.getElementById("minimapCanvas");
	c.width=height*0.3;
	c.height=height*0.34;
	img = document.getElementById("minimapImage");
	ctx = c.getContext("2d");
	timer=setInterval(draw, 10);
	return timer;
}


function draw() {
	ctx.drawImage(img, 0, 0, height*0.3, height*0.34);
}
// init();
