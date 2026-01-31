import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const ANALYSIS_SCHEMA = {
    type: "object",
    properties: {
        timestamp: { type: "string", description: "ISO 8601 timestamp estimated from the image (YYYY-MM-DDTHH:MM:SS)" },
        day_of_week: { type: "string", enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] },
        daylight: { type: "string", enum: ["night", "dawn", "morning", "midday", "afternoon", "dusk"] },
        activity: {
            type: "object",
            properties: {
                vehicles: { type: "integer", description: "Total vehicles visible" },
                pedestrians: { type: "integer", description: "Total pedestrians visible" },
                taxis: { type: "integer", description: "Taxis or rideshare vehicles visible" },
                delivery_vehicles: { type: "integer", description: "Delivery trucks/vans visible" },
                bikes_scooters: { type: "integer", description: "Bikes or scooters visible" }
            },
            required: ["vehicles", "pedestrians", "taxis", "delivery_vehicles", "bikes_scooters"]
        },
        atmosphere: {
            type: "object",
            properties: {
                visibility_miles: { type: "number", description: "Estimated visibility in miles" },
                precipitation: { type: "string", enum: ["none", "light_rain", "heavy_rain", "light_snow", "heavy_snow", "sleet", "fog"] },
                road_condition: { type: "string", enum: ["dry", "wet", "snow_covered", "icy", "slushy", "flooded"] },
                sky_condition: { type: "string", enum: ["clear", "partly_cloudy", "overcast", "heavy_clouds", "not_visible"] },
                fog_haze: { type: "boolean", description: "Whether fog or haze is present" }
            },
            required: ["visibility_miles", "precipitation", "road_condition", "sky_condition", "fog_haze"]
        },
        building_occupancy: {
            type: "object",
            properties: {
                residential_windows_lit_pct: { type: "integer", description: "Percentage of residential windows that appear lit (0-100)" },
                office_windows_lit_pct: { type: "integer", description: "Percentage of office windows that appear lit (0-100)" }
            },
            required: ["residential_windows_lit_pct", "office_windows_lit_pct"]
        },
        street_features: {
            type: "object",
            properties: {
                street_lights_on: { type: "boolean" },
                holiday_decorations_on: { type: "boolean", description: "Whether holiday decorations/lights are illuminated" },
                wells_fargo_sign_on: { type: "boolean", description: "Whether the Wells Fargo sign is lit up" },
                sidewalks_cleared: { type: "boolean", description: "Whether sidewalks appear cleared of snow/debris" },
                trash_bins_visible: { type: "boolean" }
            },
            required: ["street_lights_on", "holiday_decorations_on", "wells_fargo_sign_on", "sidewalks_cleared", "trash_bins_visible"]
        },
        seasonal: {
            type: "object",
            properties: {
                tree_foliage: { type: "string", enum: ["bare", "budding", "full", "autumn_colors", "mixed"] },
                holiday_decorations_present: { type: "boolean", description: "Whether any holiday decorations are visible (lit or not)" },
                season_estimate: { type: "string", enum: ["winter", "spring", "summer", "fall"] }
            },
            required: ["tree_foliage", "holiday_decorations_present", "season_estimate"]
        },
        urban_vibe: {
            type: "object",
            properties: {
                activity_level: { type: "string", enum: ["dead", "low", "moderate", "busy", "hectic"] },
                hustle_score: { type: "integer", description: "1-10 scale of how busy/hustling the scene feels" },
                cozy_factor: { type: "integer", description: "1-10 scale of how cozy/inviting the scene feels" },
                would_go_outside: { type: "boolean", description: "Whether the conditions look inviting enough to go outside" }
            },
            required: ["activity_level", "hustle_score", "cozy_factor", "would_go_outside"]
        }
    },
    required: ["timestamp", "day_of_week", "daylight", "activity", "atmosphere", "building_occupancy", "street_features", "seasonal", "urban_vibe"]
};

export async function analyzeImage(imagePath) {
    const absolutePath = path.resolve(imagePath);
    const imageData = fs.readFileSync(absolutePath);
    const base64Image = imageData.toString('base64');
    const mediaType = 'image/jpeg';

    // Extract filename for context (contains timestamp info)
    const filename = path.basename(imagePath);

    const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: base64Image
                        }
                    },
                    {
                        type: 'text',
                        text: `Analyze this street camera image and provide a structured JSON assessment. The image filename is "${filename}" which encodes the capture time as YYYY-MM-DD-HH-MM.jpg (timezone: America/New_York). Use this to determine the timestamp, day of week, and time of day.

Carefully observe and estimate all fields. For counts (vehicles, pedestrians, etc.), count what you can actually see. For percentages and scores, give your best estimate. Be precise and honest - if you can't see something clearly, use your best judgment based on available visual cues.`
                    }
                ]
            }
        ],
        tools: [
            {
                name: 'scene_analysis',
                description: 'Record the structured analysis of the street camera image',
                input_schema: ANALYSIS_SCHEMA
            }
        ],
        tool_choice: { type: 'tool', name: 'scene_analysis' }
    });

    // Extract the tool use result
    const toolUse = response.content.find(block => block.type === 'tool_use');
    if (!toolUse) {
        throw new Error('Claude did not return structured tool output');
    }

    return toolUse.input;
}
