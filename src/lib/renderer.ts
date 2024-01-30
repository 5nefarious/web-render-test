import {
    type StructuredView,
    makeShaderDataDefinitions,
    makeStructuredView
} from 'webgpu-utils';
import computeShaderSource from '$lib/shaders/compute.wgsl?raw';
import drawShadersSource from '$lib/shaders/draw.wgsl?raw';


class RenderPipeline {
    private constructor(
        private readonly device: GPUDevice,
        readonly compute: GPUComputePipeline,
        readonly render: GPURenderPipeline,
        public computeBindGroup: GPUBindGroup,
        public renderBindGroup: GPUBindGroup,
        private readonly sampler: GPUSampler,
        private readonly raySamplingUniform: StructuredView,
        private readonly raySamplingBuffer: GPUBuffer,
        private rayFramebuffer: GPUTexture,
    ) {}

    public static async create(
        device: GPUDevice,
        format: GPUTextureFormat,
        width: number,
        height: number,
        timeStamp: DOMHighResTimeStamp
    ): Promise<RenderPipeline> {
        const rayFramebuffer = RenderPipeline.createRayFramebuffer(
            device, width, height);
        const rayFramebufferView = rayFramebuffer.createView();

        const computeDefs = makeShaderDataDefinitions(computeShaderSource);
        const raySamplingUniform = makeStructuredView(
            computeDefs.uniforms.samplingParams);

        raySamplingUniform.set({
            seed: timeStamp,
            extent: [width, height]
        });

        const raySamplingBuffer = device.createBuffer({
            label: "Ray sampling parameters",
            size: raySamplingUniform.arrayBuffer.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const computeBindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: 'write-only',
                        format: 'rgba16float'
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: 'uniform'
                    }
                }
            ]
        });

        const computeBindGroup = RenderPipeline.createComputeBindgroup(
            device,
            computeBindGroupLayout,
            rayFramebufferView,
            raySamplingBuffer
        );

        const computePiplineLayout = device.createPipelineLayout({
            bindGroupLayouts: [computeBindGroupLayout]
        });

        const computeShaderModule = device.createShaderModule({
            code: computeShaderSource
        });

        const computePipelinePromise = device.createComputePipelineAsync({
            layout: computePiplineLayout,
            compute: {
                module: computeShaderModule,
                entryPoint: 'main'
            }
        });

        const sampler = device.createSampler();

        const renderBindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'unfilterable-float'
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {
                        type: 'non-filtering'
                    }
                }
            ]
        });

        const renderBindGroup = RenderPipeline.createRenderBindgroup(
            device, renderBindGroupLayout, rayFramebufferView, sampler);
        
        const renderPipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [renderBindGroupLayout]
        });

        const drawShaders = device.createShaderModule({
            code: drawShadersSource
        });

        const renderPipelinePromise = device.createRenderPipelineAsync({
            layout: renderPipelineLayout,
            vertex: {
                module: drawShaders,
                entryPoint: 'vertexMain'
            },
            fragment: {
                module: drawShaders,
                entryPoint: 'fragmentMain',
                targets: [
                    {
                        format: format 
                    }
                ]
            }
        });

        const [computePipeline, renderPipeline] = await Promise.all([
            computePipelinePromise, renderPipelinePromise])
        
        return new RenderPipeline(
            device,
            computePipeline,
            renderPipeline,
            computeBindGroup,
            renderBindGroup,
            sampler,
            raySamplingUniform,
            raySamplingBuffer,
            rayFramebuffer
        );
    }

    public update(
        queue: GPUQueue,
        width: number,
        height: number,
        timeStamp: DOMHighResTimeStamp
    ) {
        const extent = this.raySamplingUniform.views.extent;
        if (extent[0] != width || extent[1] != height) {
            this.rayFramebuffer = RenderPipeline.createRayFramebuffer(
                this.device, width, height);
            const rayFramebufferView = this.rayFramebuffer.createView();

            this.computeBindGroup = RenderPipeline.createComputeBindgroup(
                this.device,
                this.compute.getBindGroupLayout(0),
                rayFramebufferView,
                this.raySamplingBuffer
            );

            this.renderBindGroup = RenderPipeline.createRenderBindgroup(
                this.device,
                this.render.getBindGroupLayout(0),
                rayFramebufferView,
                this.sampler
            );

            this.raySamplingUniform.set({
                extent: [width, height]
            });
        }

        this.raySamplingUniform.set({
            seed: timeStamp
        });

        queue.writeBuffer(this.raySamplingBuffer, 0,
            this.raySamplingUniform.arrayBuffer);
    }

    private static createRayFramebuffer(
        device: GPUDevice,
        width: number,
        height: number
    ): GPUTexture {
        return device.createTexture({
            label: "Compute framebuffer",
            format: 'rgba16float',
            size: [width, height],
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.STORAGE_BINDING
        });
    }

    private static createComputeBindgroup(
        device: GPUDevice,
        layout: GPUBindGroupLayout,
        rayFramebufferView: GPUTextureView,
        raySamplingBuffer: GPUBuffer
    ): GPUBindGroup {
        return device.createBindGroup({
            layout: layout,
            entries: [
                {
                    binding: 0,
                    resource: rayFramebufferView
                },
                {
                    binding: 1,
                    resource: {
                        buffer: raySamplingBuffer
                    }
                }
            ]
        });
    }

    private static createRenderBindgroup(
        device: GPUDevice,
        layout: GPUBindGroupLayout,
        rayFramebufferView: GPUTextureView,
        sampler: GPUSampler
    ): GPUBindGroup {
        return device.createBindGroup({
            layout: layout,
            entries: [
                {
                    binding: 0,
                    resource: rayFramebufferView
                },
                {
                    binding: 1,
                    resource: sampler
                }
            ]
        });
    }
}


export class Renderer {
    private constructor(
        private readonly device: GPUDevice,
        private readonly context: GPUCanvasContext,
        private readonly format: GPUTextureFormat,
        private readonly pipeline: RenderPipeline
    ) {}

    public static async create(
        canvas: HTMLCanvasElement,
        gpu: GPU,
        timeStamp: DOMHighResTimeStamp = 0.0
    ): Promise<Renderer> {
        const adapter = await gpu.requestAdapter();
        if (!adapter) {
            throw new Error("No GPU adapter found.")
        }

        const device = await adapter.requestDevice();
        const context = canvas.getContext("webgpu");
        if (!context) {
            throw new Error("Failed to get canvas context.")
        }

        const canvasFormat = gpu.getPreferredCanvasFormat();
        context.configure({
            device: device,
            format: canvasFormat
        });

        const pipeline = await RenderPipeline.create(
            device,
            canvasFormat,
            canvas.width,
            canvas.height,
            timeStamp
        );

        return new Renderer(device, context, canvasFormat, pipeline);
    }

    public handleResize(width: number, height: number) {
        const maxSize = this.device.limits.maxTextureDimension2D;
        const canvas = this.context.canvas;
        if (width > 0 && height > 0) {
            canvas.width = Math.min(width, maxSize);
            canvas.height = Math.min(height, maxSize);
            this.context.configure({
                device: this.device,
                format: this.format
            })
        }
    }

    public update(timeStamp: DOMHighResTimeStamp) {
        const width = this.context.canvas.width;
        const height = this.context.canvas.height;
        
        const queue = this.device.queue;
        this.pipeline.update(queue, width, height, timeStamp);

        const encoder = this.device.createCommandEncoder();

        {
            const cpass = encoder.beginComputePass();
            cpass.setPipeline(this.pipeline.compute);
            cpass.setBindGroup(0, this.pipeline.computeBindGroup);
            cpass.dispatchWorkgroups(width / 8 + 1, height / 8 + 1);
            cpass.end()
        }

        {
            const rpass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: this.context.getCurrentTexture().createView(),
                        loadOp: 'clear',
                        storeOp: 'store'
                    }
                ]
            });
            rpass.setPipeline(this.pipeline.render);
            rpass.setBindGroup(0, this.pipeline.renderBindGroup);
            rpass.draw(3);
            rpass.end();
        }

        const commandBuffer = encoder.finish();
        queue.submit([commandBuffer]);
    }
}