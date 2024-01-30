struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoords: vec2<f32>,
};

@vertex
fn vertexMain(
    @builtin(vertex_index) index: u32
) -> VertexOutput {
    var tri = array<vec2<f32>, 3u>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0),
    );
    var out: VertexOutput;
    out.position = vec4<f32>(tri[index], 0.0, 1.0);
    out.texCoords = 0.5 * tri[index] + vec2<f32>(0.5, 0.5);
    return out;
}

@group(0) @binding(0)
var rColor: texture_2d<f32>;
@group(0) @binding(1)
var rSampler: sampler;

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(rColor, rSampler, in.texCoords);
}