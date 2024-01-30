var<private> backgroundColor: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 1.0);
var<private> maxIter: i32 = 20;
var<private> tol: f32 = 0.00001;

struct RaySamplingUniform {
    seed: u32,
    extent: vec2<u32>,
};

struct CameraUniform {
    position: vec3<f32>,
    size: f32,
    fov: f32,
};

@group(0) @binding(0)
var rTexels: texture_storage_2d<rgba16float, write>;

@group(0) @binding(1)
var<uniform> samplingParams: RaySamplingUniform;

var<private> camera: CameraUniform = CameraUniform(
    vec3<f32>(0.0, 0.0, 5.0), 1.0, 60.0,
);


fn sphereSDF(p: vec3<f32>, c: vec3<f32>, r: f32) -> f32 {
    return distance(p, c) - r;
}
var<private> sphereCenter: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
var<private> sphereRadius: f32 = 1.0;


fn pcg2d(key: vec2<u32>) -> vec2<u32> {
    let a = 1664525u;
    let b = 1013904223u;
    let c = vec2<u32>(16u, 16u);
    var v = key * a + b;
    v += v.yx * a;
    v ^= (v >> c);
    v += v.yx * a;
    v ^= (v >> c);
    return v;
}

fn constructFloat(m: u32) -> f32 {
    let mantissa: u32   = 0x007fffffu;
    let one: u32        = 0x3f800000u;
    var b: u32 = m;
    b &= mantissa;
    b |= one;
    return bitcast<f32>(b) - 1.0;
}

fn uniform2D(key: vec2<u32>) -> vec2<f32> {
    let hash = pcg2d(key);
    return vec2<f32>(
        constructFloat(hash.x),
        constructFloat(hash.y),
    );
}

fn sphereNormal(p: vec3<f32>, d: f32) -> vec3<f32> {
    let pmat = mat3x3<f32>(p, p, p)
             + mat3x3<f32>(
        tol, 0.0, 0.0,
        0.0, tol, 0.0,
        0.0, 0.0, tol,
    );
    let p2 = vec3<f32>(
        sphereSDF(pmat[0], sphereCenter, sphereRadius),
        sphereSDF(pmat[1], sphereCenter, sphereRadius),
        sphereSDF(pmat[2], sphereCenter, sphereRadius),
    );
    return normalize(p2 - d);
}

fn getInitialDirection(
    frameCoord: vec2<f32>,
    frameExtent: vec2<f32>,
    camera: CameraUniform,
) -> vec3<f32> {
    let phi = atan2(frameExtent.y, frameExtent.x);
    let diagDistance = camera.size * tan(radians(camera.fov));
    let topLeft = vec3<f32>(
        diagDistance / 2.0 * -cos(phi),
        diagDistance / 2.0 *  sin(phi),
        camera.position.z - camera.size,
    );
    let diagPixels = distance(frameExtent, vec2<f32>());
    let pixelToDistance = diagDistance / diagPixels;
    let pixelPosition = topLeft + pixelToDistance * vec3<f32>(
         frameCoord.x,
        -frameCoord.y,
         0.0,
    );
    return normalize(pixelPosition - camera.position);
}

@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) globalID: vec3<u32>,
) {
    let extent = min(
        vec2<f32>(samplingParams.extent),
        vec2<f32>(textureDimensions(rTexels)),
    );
    let raySeed = samplingParams.seed + globalID.xy;
    let globalPosition = vec2<f32>(globalID.xy) + uniform2D(raySeed);

    var color = backgroundColor;
    var rayPosition = camera.position;
    let rayDirection = getInitialDirection(
        globalPosition, extent, camera,
    );
    for (var i = 0; i < maxIter; i++) {
        let distance = sphereSDF(rayPosition, sphereCenter, sphereRadius);
        if (distance < tol) {
            let n = sphereNormal(rayPosition, distance);
            color = vec4<f32>(n, 1.0);
            break;
        } else {
            rayPosition += rayDirection * distance;
        }
    }
    let pixelID = vec2<i32>(globalID.xy);
    textureStore(rTexels, pixelID, color);
}