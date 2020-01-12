var pixelRatio = Math.min(window.devicePixelRatio, 1.5);
var regl = require("regl")({
  pixelRatio: pixelRatio,
  attributes: {
    antialias: false,
    stencil: false,
    alpha: false,
    depth: true
  }
});

// var createReglRecorder = require("regl-recorder");
// var fs = require("fs");

// var videoSize = 1000;
// var regl = require("regl")(require("gl")(videoSize, videoSize));
// var recorder = createReglRecorder(regl, 200);
// var jpeg = require("jpeg-js");

var camera = require("regl-camera")(regl, {
  minDistance: 5,
  distance: 12,
  maxDistance: 25
});
var icosphere = require("icosphere");
var glsl = require("glslify");
var resl = require("resl");

resl({
  manifest: {
    moon: { type: "image", src: "moon_small.jpg" }
  },
  onDone: onloaded
});

// onloaded({
//   moon: jpeg.decode(fs.readFileSync("moon.jpg"))
// });

// create fbo. We set the size in `regl.frame`
const fbo = regl.framebuffer({
  color: regl.texture({
    width: 1,
    height: 1,
    wrap: "clamp"
  }),
  depth: true
});

function onloaded(assets) {
  // console.dir(assets.moon);

  var drawEarth = opts => {
    return earth(regl, {
      textures: {
        moon: regl.texture({
          data: assets.moon,
          mag: "linear"
          // ...assets.moon
        })
      },

      ...opts
    });
  };

  const drawFboBlurred = regl({
    frag: glsl`
    precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform float wRcp, hRcp;
uniform vec2 resolution;
uniform float pixelRatio;
#define R int(0)

// clang-format off
// #pragma glslify: dither = require(glsl-dither)
// #pragma glslify: dither = require(glsl-dither/8x8)
#pragma glslify: dither = require(glsl-dither/4x4)
// #pragma glslify: dither = require(glsl-dither/2x2)
// clang-format on

void main() {
  vec4 color = texture2D(tex, uv);

  gl_FragColor =  dither(gl_FragCoord.xy/pixelRatio, color);
}`,
    vert: `
    precision highp float;
    attribute vec2 position;
    varying vec2 uv;
    void main() {
      uv = 0.5 * (position + 1.0);
      gl_Position = vec4(position, 0, 1);
    }`,
    attributes: {
      position: [-4, -4, 4, -4, 0, 4]
    },
    uniforms: {
      tex: ({ count }) => fbo,
      resolution: ({ viewportWidth, viewportHeight }) => [
        viewportWidth,
        viewportHeight
      ],
      wRcp: ({ viewportWidth }) => 1.0 / viewportWidth,
      hRcp: ({ viewportHeight }) => 1.0 / viewportHeight,
      pixelRatio: pixelRatio
    },
    depth: { enable: false },
    count: 3
  });
  var amt = 1.5;

  var n = 9;
  var r = 1.5;
  var earths = Array(n)
    .fill("")
    .map((_, i) =>
      drawEarth({
        x: r * Math.sin((Math.PI * 2 * i) / n),
        y: r * Math.cos((Math.PI * 2 * i) / n),
        t_offset: amt * i
      })
    );
  regl.frame(function({ viewportWidth, viewportHeight }) {
    fbo.resize(viewportWidth, viewportHeight);

    // regl.clear({ color: [0, 0, 0, 1], depth: true });
    camera(function() {
      fbo.use(() => {
        regl.clear({ color: [0.0, 0.0, 0.0, 1], depth: true });

        earths.forEach(d => d());
      });
      drawFboBlurred();
    });
  });
}

function earth(regl, opts) {
  var mesh = icosphere(3);
  return regl({
    frag: glsl`
      precision highp float;

      #pragma glslify: atmosphere = require('glsl-atmosphere')
      #pragma glslify: noise = require('glsl-noise/simplex/3d')
      #pragma glslify: fbm3d = require('glsl-fractal-brownian-noise/3d')
      #pragma glslify: luma = require(glsl-luma)

      // uniform sampler2D day, night, clouds, moon;
      uniform sampler2D moon;
      uniform vec3 eye, sunpos;
      uniform float time;
      varying vec3 vpos;
      void main () {
        vec3 pos = normalize(vpos);
        vec3 vscatter = atmosphere(
          eye-pos, // ray direction
          pos*1372e3, // ray origin
          sunpos, // sun position
          25.0, // sun intensity
          1372e3, // planet radius (m)
          1572e3, // atmosphere radius (m)
          vec3(5.5e-6,13.0e-6,22.4e-6), // rayleigh scattering
          21e-6, // mie scattering
          8e3, // rayleight scale height
          1.2e3, // mie scale height
          0.758 //  mie scattering direction
        );
        float lon = mod(atan(vpos.x,vpos.z)*${1 / (2 * Math.PI)}-time*0.01,1.0);
        float lat = asin(-vpos.y*0.79-0.02)*0.5+0.5;
      
        vec3 tmoon = texture2D(moon,vec2(lon,lat)).rgb;

        float light = length(vscatter);
        float polar = pow(cos(pow(vpos.y,32.0)),32.0);


     
        vec3 c =( (tmoon-0.3)*2.0) * light + vscatter *0.1;

          // + vec3(1.0-polar)*light*0.5; 
          // c = vec3(light);
         vec3 color = pow(c,vec3(1.0/2.2));

        //  float n =   ((fbm3d(vec3(gl_FragCoord.xy / 4.0, time * 0.0),2) * 0.5) + 0.5);
        //  color = vec3(n);
          // if (luma(color) <  n){
          // color = vec3(0.0);
        // }else{
          // color = vec3(1.0);
        // }
        color = vec3(pow(luma(color),0.8));
        // color *= 1.2;
        gl_FragColor = vec4(color,1.0);
      }
    `,
    vert: glsl`
      precision highp float;
      uniform mat4 projection, view;
      uniform float x,y;
      attribute vec3 position;
      varying vec3 vpos;
      void main () {
        vpos = position ;
        gl_Position = projection * view * vec4(vpos+ vec3(0.,x*2.0,y*2.0),1);
      }
    `,
    attributes: {
      position: mesh.positions
    },
    elements: mesh.cells,
    uniforms: {
      sunpos: function(context) {
        var t = (context.time + opts.t_offset) * 0.5;
        var r = 10;
        return [Math.cos(t) * r, 0, Math.sin(t) * r];
      },
      x: opts.x,
      y: opts.y,
      time: context => {
        return context.time + opts.t_offset * 50;
      },
      // day: opts.textures.day,
      // night: opts.textures.night,
      // clouds: opts.textures.clouds,
      moon: opts.textures.moon,
      pixelRatio: pixelRatio
    },
    framebuffer: fbo
  });
}
