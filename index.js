var regl = require("regl")();
var camera = require("regl-camera")(regl, { minDistance: 1, distance: 3 });
var icosphere = require("icosphere");
var glsl = require("glslify");
var resl = require("resl");

resl({
  manifest: {
    day: { type: "image", src: "day.jpg" },
    night: { type: "image", src: "night.jpg" },
    clouds: { type: "image", src: "clouds.jpg" },
    moon: { type: "image", src: "moon.jpg" }
  },
  onDone: onloaded
});

function onloaded(assets) {
  var draw = earth(regl, {
    textures: {
      day: regl.texture({ data: assets.day, mag: "linear" }),
      night: regl.texture({ data: assets.night, mag: "linear" }),
      clouds: regl.texture({ data: assets.clouds, mag: "linear" }),
      moon: regl.texture({ data: assets.moon, mag: "linear" })
    }
  });
  regl.frame(function() {
    regl.clear({ color: [0, 0, 0, 1], depth: true });
    camera(function() {
      draw();
    });
  });
}

function earth(regl, opts) {
  var mesh = icosphere(3);
  return regl({
    frag: glsl`
      precision mediump float;

      #pragma glslify: atmosphere = require('glsl-atmosphere')
      #pragma glslify: noise = require('glsl-noise/simplex/3d')
      #pragma glslify: fbm3d = require('glsl-fractal-brownian-noise/3d')
      #pragma glslify: luma = require(glsl-luma)

      uniform sampler2D day, night, clouds, moon;
      uniform vec3 eye, sunpos;
      uniform float time;
      varying vec3 vpos;
      void main () {
        vec3 pos = normalize(vpos);
        vec3 vscatter = atmosphere(
          eye-pos, // ray direction
          pos*1372e3, // ray origin
          sunpos, // sun position
          22.0, // sun intensity
          1372e3, // planet radius (m)
          1472e3, // atmosphere radius (m)
          vec3(5.5e-6,13.0e-6,22.4e-6), // rayleigh scattering
          21e-6, // mie scattering
          8e3, // rayleight scale height
          1.2e3, // mie scale height
          0.758 //  mie scattering direction
        );
        float lon = mod(atan(vpos.x,vpos.z)*${1 / (2 * Math.PI)}-time*0.01,1.0);
        float lat = asin(-vpos.y*0.79-0.02)*0.5+0.5;
        
        vec3 tday = texture2D(day,vec2(lon,lat)).rgb * 0.7;
        vec3 tnight = texture2D(night,vec2(lon,lat)).rgb + vec3(0.3);
        vec3 tclouds = texture2D(clouds,vec2(lon,lat)).rgb * 0.7;
        vec3 tmoon = texture2D(moon,vec2(lon,lat)).rgb;

        float light = length(vscatter);
        float polar = pow(cos(pow(vpos.y,32.0)),32.0);


        vec3 c = vscatter*0.2 + tday*light
          + tclouds*(light*0.5+(1.0-light)*2e-4)
          + vec3(1.0-polar)*light*0.5
          + pow(tnight,vec3(8.0))*pow(max(0.0,1.0-light),8.0);

         c =( (tmoon-0.8)*3.0) * light + vscatter *0.1
        //  + tclouds*(light*0.5+(1.0-light)*2e-4)

          + vec3(1.0-polar)*light*0.5; 
          // c = vec3(light);
         vec3 color = pow(c,vec3(1.0/2.2));

         float n =   ((fbm3d(vec3(gl_FragCoord.xy / 2.0, time * 0.0001),3) * 0.5) + 0.5);
        //  color = vec3(n);
          if (luma(color) <  n){
          color = vec3(0.0);
        }else{
          color = vec3(1.0);
        }
        gl_FragColor = vec4(color,1.0);
      }
    `,
    vert: glsl`
      precision mediump float;
      uniform mat4 projection, view;
      attribute vec3 position;
      varying vec3 vpos;
      void main () {
        vpos = position;
        gl_Position = projection * view * vec4(vpos,1);
      }
    `,
    attributes: {
      position: mesh.positions
    },
    elements: mesh.cells,
    uniforms: {
      sunpos: function(context) {
        var t = context.time * 0.5,
          r = 10;
        return [Math.cos(t) * r, 0, Math.sin(t) * r];
      },
      time: regl.context("time"),
      day: opts.textures.day,
      night: opts.textures.night,
      clouds: opts.textures.clouds,
      moon: opts.textures.moon
    }
  });
}
