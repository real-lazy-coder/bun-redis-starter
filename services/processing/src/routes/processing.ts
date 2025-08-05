import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq, desc } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, workflows, workflowExecutions, type Workflow, type NewWorkflow, type WorkflowExecution, type NewWorkflowExecution } from '../models/database';
import { jwtConfig, serviceUrls } from '../config';

const processing = new Hono();

// Validation schemas
const CreateWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(z.object({
    id: z.string(),
    type: z.string(),
    config: z.record(z.any()),
    nextSteps: z.array(z.string()).optional(),
  })),
  triggers: z.array(z.object({
    type: z.enum(['manual', 'schedule', 'event']),
    config: z.record(z.any()),
  })),
});

const UpdateWorkflowSchema = CreateWorkflowSchema.partial();

const ExecuteWorkflowSchema = z.object({
  context: z.record(z.any()).optional(),
});

// Utility functions
const createSuccessResponse = <T>(data: T, message?: string) => ({
  success: true,
  data,
  message,
  timestamp: new Date().toISOString(),
});

const createErrorResponse = (error: string, message?: string) => ({
  success: false,
  error,
  message,
  timestamp: new Date().toISOString(),
});

const validateBody = (schema: z.ZodSchema) => {
  return async (c: Context, next: any) => {
    try {
      const body = await c.req.json();
      const validatedBody = schema.parse(body);
      (c as any).validatedBody = validatedBody;
      await next();
    } catch (error) {
      const logger = (c as any).logger;
      logger.error(error, 'Request validation error');
      return c.json(createErrorResponse('Validation error', error instanceof Error ? error.message : 'Invalid request body'), 400);
    }
  };
};

const jwtAuth = (secret: string) => {
  return async (c: Context, next: any) => {
    const authorization = c.req.header('authorization');
    
    if (!authorization) {
      return c.json(createErrorResponse('Authorization header required'), 401);
    }

    const token = authorization.replace('Bearer ', '');
    
    try {
      const payload = jwt.verify(token, secret);
      (c as any).user = payload;
      await next();
    } catch (error) {
      return c.json(createErrorResponse('Invalid token'), 401);
    }
  };
};

// Workflow execution engine
class WorkflowEngine {
  private async executeStep(step: any, context: any, execution: WorkflowExecution) {
    const logger = console; // TODO: Use proper logger
    logger.log(`Executing step: ${step.id} (${step.type})`);

    try {
      switch (step.type) {
        case 'start':
          logger.log('Workflow started');
          return { success: true, result: 'Started' };

        case 'log':
          const message = step.config.message || 'Log step executed';
          logger.log(`Log step: ${message}`);
          return { success: true, result: message };

        case 'data_fetch':
          // Example: Fetch data from data service
          if (step.config.entityId) {
            try {
              // This would make an HTTP call to the data service
              logger.log(`Fetching entity: ${step.config.entityId}`);
              return { success: true, result: { entityId: step.config.entityId, fetched: true } };
            } catch (error) {
              return { success: false, error: `Failed to fetch data: ${error}` };
            }
          }
          return { success: true, result: 'No entity ID provided' };

        case 'data_transform':
          // Example: Transform data
          const inputData = context.data || step.config.inputData;
          const transformedData = {
            ...inputData,
            transformed: true,
            transformedAt: new Date().toISOString(),
          };
          logger.log('Data transformed');
          return { success: true, result: transformedData };

        case 'conditional':
          // Example: Conditional logic
          const condition = step.config.condition;
          const conditionResult = this.evaluateCondition(condition, context);
          logger.log(`Condition evaluated: ${conditionResult}`);
          return { success: true, result: conditionResult };

        case 'delay':
          // Example: Delay step
          const delayMs = step.config.delayMs || 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
          logger.log(`Delayed for ${delayMs}ms`);
          return { success: true, result: `Delayed ${delayMs}ms` };

        case 'end':
          logger.log('Workflow completed');
          return { success: true, result: 'Completed' };

        default:
          logger.log(`Unknown step type: ${step.type}`);
          return { success: false, error: `Unknown step type: ${step.type}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Step execution failed' };
    }
  }

  private evaluateCondition(condition: string, context: any): boolean {
    // Simple condition evaluation - in production, use a proper expression evaluator
    try {
      // Example conditions: "data.priority === 'high'", "context.count > 10"
      // For safety, we'll just do simple string matching for now
      if (condition.includes('priority') && condition.includes('high')) {
        return context.data?.priority === 'high';
      }
      if (condition.includes('count') && condition.includes('>')) {
        const match = condition.match(/count\s*>\s*(\d+)/);
        if (match) {
          const threshold = parseInt(match[1]);
          return (context.count || 0) > threshold;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async executeWorkflow(workflow: Workflow, context: any = {}, triggeredBy: string) {
    const executionId = crypto.randomUUID();
    
    // Create execution record
    const newExecution: NewWorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      status: 'running',
      context: JSON.stringify(context),
      triggeredBy,
    };

    const [execution] = await db.insert(workflowExecutions).values(newExecution).returning();
    
    try {
      const steps = JSON.parse(workflow.steps);
      const results: any = {};
      let currentStepId = steps.find((s: any) => s.type === 'start')?.id || steps[0]?.id;
      
      while (currentStepId) {
        const step = steps.find((s: any) => s.id === currentStepId);
        if (!step) break;

        const stepResult = await this.executeStep(step, context, execution);
        results[step.id] = stepResult;

        if (!stepResult.success) {
          // Step failed, mark execution as failed
          await db.update(workflowExecutions)
            .set({
              status: 'failed',
              error: stepResult.error,
              results: JSON.stringify(results),
              completedAt: new Date().toISOString(),
            })
            .where(eq(workflowExecutions.id, executionId));
          
          return { success: false, error: stepResult.error, results };
        }

        // Update context with step result
        if (stepResult.result) {
          context[`step_${step.id}`] = stepResult.result;
        }

        // Determine next step
        if (step.nextSteps && step.nextSteps.length > 0) {
          // For simplicity, just take the first next step
          // In production, this could be conditional based on step results
          currentStepId = step.nextSteps[0];
        } else {
          // No more steps
          currentStepId = null;
        }
      }

      // Mark execution as completed
      await db.update(workflowExecutions)
        .set({
          status: 'completed',
          results: JSON.stringify(results),
          completedAt: new Date().toISOString(),
        })
        .where(eq(workflowExecutions.id, executionId));

      return { success: true, results, executionId };

    } catch (error) {
      // Mark execution as failed
      await db.update(workflowExecutions)
        .set({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Workflow execution failed',
          completedAt: new Date().toISOString(),
        })
        .where(eq(workflowExecutions.id, executionId));

      throw error;
    }
  }
}

const workflowEngine = new WorkflowEngine();

// Create workflow
processing.post('/workflows', jwtAuth(jwtConfig.secret), validateBody(CreateWorkflowSchema), async (c: Context) => {
  const workflowData = (c as any).validatedBody;
  const user = (c as any).user;
  
  try {
    const newWorkflow: NewWorkflow = {
      name: workflowData.name,
      description: workflowData.description,
      steps: JSON.stringify(workflowData.steps),
      triggers: JSON.stringify(workflowData.triggers),
      createdBy: user.userId,
    };

    const [createdWorkflow] = await db.insert(workflows).values(newWorkflow).returning();
    
    // Parse JSON fields for response
    const workflowResponse = {
      ...createdWorkflow,
      steps: JSON.parse(createdWorkflow.steps),
      triggers: JSON.parse(createdWorkflow.triggers),
    };

    return c.json(createSuccessResponse(workflowResponse, 'Workflow created successfully'), 201);
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Create workflow error');
    return c.json(createErrorResponse('Failed to create workflow'), 500);
  }
});

// Get all workflows
processing.get('/workflows', jwtAuth(jwtConfig.secret), async (c: Context) => {
  try {
    const allWorkflows = await db.select().from(workflows).orderBy(desc(workflows.createdAt));
    
    // Parse JSON fields for response
    const workflowsResponse = allWorkflows.map(workflow => ({
      ...workflow,
      steps: JSON.parse(workflow.steps),
      triggers: JSON.parse(workflow.triggers),
    }));

    return c.json(createSuccessResponse(workflowsResponse));
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Get workflows error');
    return c.json(createErrorResponse('Failed to get workflows'), 500);
  }
});

// Get workflow by ID
processing.get('/workflows/:id', jwtAuth(jwtConfig.secret), async (c: Context) => {
  try {
    const workflowId = c.req.param('id');
    
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
    
    if (!workflow) {
      return c.json(createErrorResponse('Workflow not found'), 404);
    }

    // Parse JSON fields for response
    const workflowResponse = {
      ...workflow,
      steps: JSON.parse(workflow.steps),
      triggers: JSON.parse(workflow.triggers),
    };

    return c.json(createSuccessResponse(workflowResponse));
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Get workflow error');
    return c.json(createErrorResponse('Failed to get workflow'), 500);
  }
});

// Execute workflow
processing.post('/workflows/:id/execute', jwtAuth(jwtConfig.secret), validateBody(ExecuteWorkflowSchema), async (c: Context) => {
  try {
    const workflowId = c.req.param('id');
    const executeData = (c as any).validatedBody;
    const user = (c as any).user;
    
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
    
    if (!workflow) {
      return c.json(createErrorResponse('Workflow not found'), 404);
    }

    if (workflow.status !== 'active') {
      return c.json(createErrorResponse('Workflow is not active'), 400);
    }

    const result = await workflowEngine.executeWorkflow(
      workflow, 
      executeData.context || {}, 
      user.userId
    );

    return c.json(createSuccessResponse(result, 'Workflow executed successfully'));
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Execute workflow error');
    return c.json(createErrorResponse('Failed to execute workflow'), 500);
  }
});

// Get workflow executions
processing.get('/workflows/:id/executions', jwtAuth(jwtConfig.secret), async (c: Context) => {
  try {
    const workflowId = c.req.param('id');
    
    const executions = await db.select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowId, workflowId))
      .orderBy(desc(workflowExecutions.startedAt));

    // Parse JSON fields for response
    const executionsResponse = executions.map(execution => ({
      ...execution,
      results: JSON.parse(execution.results),
      context: JSON.parse(execution.context),
    }));

    return c.json(createSuccessResponse(executionsResponse));
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Get executions error');
    return c.json(createErrorResponse('Failed to get executions'), 500);
  }
});

// Update workflow status
processing.patch('/workflows/:id/status', jwtAuth(jwtConfig.secret), async (c: Context) => {
  try {
    const workflowId = c.req.param('id');
    const body = await c.req.json();
    const { status } = body;

    if (!['active', 'inactive', 'draft'].includes(status)) {
      return c.json(createErrorResponse('Invalid status'), 400);
    }

    const [updatedWorkflow] = await db.update(workflows)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workflows.id, workflowId))
      .returning();

    if (!updatedWorkflow) {
      return c.json(createErrorResponse('Workflow not found'), 404);
    }

    // Parse JSON fields for response
    const workflowResponse = {
      ...updatedWorkflow,
      steps: JSON.parse(updatedWorkflow.steps),
      triggers: JSON.parse(updatedWorkflow.triggers),
    };

    return c.json(createSuccessResponse(workflowResponse, 'Workflow status updated successfully'));
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Update workflow status error');
    return c.json(createErrorResponse('Failed to update workflow status'), 500);
  }
});

export default processing;