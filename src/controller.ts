import { handleAudioGeneration } from "./generateContent/text2audio";
import { handleVideoGeneration } from "./generateContent/text2video";
import { handleCarouselGeneration } from "./generateContent/text2carousel";
import { ContentType, GeneratedContent } from "./types";

// Main Controller Class/Module
export const Controller = {
  async processGroup(groupName: string, contentList: any[]): Promise<GeneratedContent> {
    // Pick random content
    const content = contentList[Math.floor(Math.random() * contentList.length)];
    const topic = typeof content === 'string' ? content : content.title || content.text || "General Update";
    
    // Determine type
    const rand = Math.random() * 100;
    let type: ContentType = 'audio';
    
    if (rand < 5) {
        type = 'video';
    } else if (rand < 52.5) { // 5 + 47.5
        type = 'carousel';
    } else {
        type = 'audio';
    }
    
    console.log(`Selected Content Type: ${type} for group ${groupName}`);
    
    let result: GeneratedContent;
    
    try {
        switch (type) {
            case 'video':
                result = await handleVideoGeneration(topic);
                break;
            case 'carousel':
                result = await handleCarouselGeneration(topic);
                break;
            case 'audio':
                result = await handleAudioGeneration(topic);
                break;
        }
        return result;
    } catch (error) {
        console.error("Controller Error:", error);
        throw error;
    }
  }
};
