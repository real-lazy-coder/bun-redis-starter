import { NotificationStorage } from '../models';
import { CreateTemplateDto, UpdateTemplateDto } from '../models/validation';

export class TemplateService {
  private storage: NotificationStorage;

  constructor(storage: NotificationStorage) {
    this.storage = storage;
  }

  private replaceVariables(content: string, variables: Record<string, any>): string {
    let result = content;
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, String(value));
    }
    
    return result;
  }

  async createTemplate(data: CreateTemplateDto) {
    const template = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.storage.saveTemplate(template);
    return template;
  }

  async updateTemplate(id: string, data: UpdateTemplateDto) {
    const existing = await this.storage.getTemplate(id);
    if (!existing) {
      throw new Error(`Template not found: ${id}`);
    }

    const updated = {
      ...existing,
      ...data,
      id, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };

    await this.storage.saveTemplate(updated);
    return updated;
  }

  async getTemplate(id: string) {
    return await this.storage.getTemplate(id);
  }

  async listTemplates(type?: string) {
    return await this.storage.listTemplates(type);
  }

  async deleteTemplate(id: string) {
    const existing = await this.storage.getTemplate(id);
    if (!existing) {
      throw new Error(`Template not found: ${id}`);
    }

    await this.storage.deleteTemplate(id);
  }

  async renderTemplate(
    templateId: string, 
    variables: Record<string, any> = {},
    language?: string
  ): Promise<{ subject?: string; content: string }> {
    const template = await this.storage.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // TODO: Support multiple languages
    if (language && language !== template.language) {
      // In a full implementation, we'd look for the template in the requested language
      console.warn(`Requested language ${language} not available, using ${template.language}`);
    }

    const content = this.replaceVariables(template.content, variables);
    const subject = template.subject ? this.replaceVariables(template.subject, variables) : undefined;

    return { subject, content };
  }

  async validateTemplate(content: string, variables: string[]): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Check for undefined variables in template
    const variableRegex = /{{\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*}}/g;
    const matches = Array.from(content.matchAll(variableRegex));
    
    for (const match of matches) {
      const variableName = match[1];
      if (!variables.includes(variableName)) {
        errors.push(`Undefined variable: ${variableName}`);
      }
    }

    // Check for unclosed template tags
    const openTags = (content.match(/{/g) || []).length;
    const closeTags = (content.match(/}/g) || []).length;
    
    if (openTags !== closeTags) {
      errors.push('Mismatched template braces');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async getTemplatePreview(
    templateId: string, 
    sampleVariables: Record<string, any> = {}
  ): Promise<{ subject?: string; content: string; usedVariables: string[]; missingVariables: string[] }> {
    const template = await this.storage.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Find all variables used in the template
    const variableRegex = /{{\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*}}/g;
    const contentMatches = Array.from(template.content.matchAll(variableRegex));
    const subjectMatches = template.subject ? Array.from(template.subject.matchAll(variableRegex)) : [];
    
    const usedVariables = new Set<string>();
    [...contentMatches, ...subjectMatches].forEach(match => {
      usedVariables.add(match[1]);
    });

    const usedVariablesArray = Array.from(usedVariables);
    const missingVariables = usedVariablesArray.filter(variable => !(variable in sampleVariables));

    // Provide default values for missing variables
    const completeVariables = { ...sampleVariables };
    missingVariables.forEach(variable => {
      completeVariables[variable] = `[${variable}]`;
    });

    const rendered = await this.renderTemplate(templateId, completeVariables);

    return {
      ...rendered,
      usedVariables: usedVariablesArray,
      missingVariables,
    };
  }
}