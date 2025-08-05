import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq, like, desc, asc } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, entities, type Entity, type NewEntity } from '../models/database';
import { jwtConfig } from '../config';

const data = new Hono();

// Validation schemas
const CreateEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  data: z.record(z.any()),
  metadata: z.record(z.string()).optional(),
});

const UpdateEntitySchema = CreateEntitySchema.partial();

const QueryEntitySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('10'),
  type: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'type', 'createdAt', 'updatedAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Utility functions
const createSuccessResponse = <T>(data: T, message?: string, pagination?: any) => ({
  success: true,
  data,
  message,
  pagination,
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

const validateQuery = (schema: z.ZodSchema) => {
  return async (c: Context, next: any) => {
    try {
      const query = c.req.query();
      const validatedQuery = schema.parse(query);
      (c as any).validatedQuery = validatedQuery;
      await next();
    } catch (error) {
      const logger = (c as any).logger;
      logger.error(error, 'Query validation error');
      return c.json(createErrorResponse('Validation error', error instanceof Error ? error.message : 'Invalid query parameters'), 400);
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

// Create entity
data.post('/entities', jwtAuth(jwtConfig.secret), validateBody(CreateEntitySchema), async (c: Context) => {
  const entityData = (c as any).validatedBody;
  const user = (c as any).user;
  
  try {
    const newEntity: NewEntity = {
      name: entityData.name,
      type: entityData.type,
      data: JSON.stringify(entityData.data),
      metadata: JSON.stringify(entityData.metadata || {}),
      createdBy: user.userId,
    };

    const [createdEntity] = await db.insert(entities).values(newEntity).returning();
    
    // Parse JSON fields for response
    const entityResponse = {
      ...createdEntity,
      data: JSON.parse(createdEntity.data),
      metadata: JSON.parse(createdEntity.metadata),
    };

    return c.json(createSuccessResponse(entityResponse, 'Entity created successfully'), 201);
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Create entity error');
    return c.json(createErrorResponse('Failed to create entity'), 500);
  }
});

// Get all entities with pagination and filtering
data.get('/entities', jwtAuth(jwtConfig.secret), validateQuery(QueryEntitySchema), async (c: Context) => {
  const query = (c as any).validatedQuery;
  
  try {
    const page = parseInt(query.page);
    const limit = parseInt(query.limit);
    const offset = (page - 1) * limit;

    // Build where conditions
    let whereConditions: any[] = [];
    
    if (query.type) {
      whereConditions.push(eq(entities.type, query.type));
    }
    
    if (query.search) {
      whereConditions.push(like(entities.name, `%${query.search}%`));
    }

    // Build order by - simplified to avoid type issues
    const orderBy = query.sortOrder === 'asc' ? 
      asc(entities.createdAt) : 
      desc(entities.createdAt);

    // Get total count - simplified approach
    const allEntities = await db.select().from(entities);
    const total = allEntities.length;

    // Get entities - simplified query building
    let entitiesResult = allEntities;
    
    // Apply filtering
    if (query.type) {
      entitiesResult = entitiesResult.filter(entity => entity.type === query.type);
    }
    
    if (query.search) {
      entitiesResult = entitiesResult.filter(entity => 
        entity.name.toLowerCase().includes(query.search.toLowerCase())
      );
    }

    // Apply sorting
    entitiesResult.sort((a, b) => {
      const aVal = a.createdAt;
      const bVal = b.createdAt;
      if (query.sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    // Apply pagination
    const paginatedEntities = entitiesResult.slice(offset, offset + limit);

    // Parse JSON fields for response
    const entitiesResponse = paginatedEntities.map(entity => ({
      ...entity,
      data: JSON.parse(entity.data),
      metadata: JSON.parse(entity.metadata),
    }));

    const pagination = {
      page,
      limit,
      total: entitiesResult.length,
      totalPages: Math.ceil(entitiesResult.length / limit),
    };

    return c.json(createSuccessResponse(entitiesResponse, undefined, pagination));
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Get entities error');
    return c.json(createErrorResponse('Failed to get entities'), 500);
  }
});

// Get entity by ID
data.get('/entities/:id', jwtAuth(jwtConfig.secret), async (c: Context) => {
  try {
    const entityId = c.req.param('id');
    
    const [entity] = await db.select().from(entities).where(eq(entities.id, entityId));
    
    if (!entity) {
      return c.json(createErrorResponse('Entity not found'), 404);
    }

    // Parse JSON fields for response
    const entityResponse = {
      ...entity,
      data: JSON.parse(entity.data),
      metadata: JSON.parse(entity.metadata),
    };

    return c.json(createSuccessResponse(entityResponse));
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Get entity error');
    return c.json(createErrorResponse('Failed to get entity'), 500);
  }
});

// Update entity
data.put('/entities/:id', jwtAuth(jwtConfig.secret), validateBody(UpdateEntitySchema), async (c: Context) => {
  try {
    const entityId = c.req.param('id');
    const updateData = (c as any).validatedBody;

    const updateFields: any = {
      updatedAt: new Date().toISOString(),
    };

    if (updateData.name) updateFields.name = updateData.name;
    if (updateData.type) updateFields.type = updateData.type;
    if (updateData.data) updateFields.data = JSON.stringify(updateData.data);
    if (updateData.metadata) updateFields.metadata = JSON.stringify(updateData.metadata);

    const [updatedEntity] = await db
      .update(entities)
      .set(updateFields)
      .where(eq(entities.id, entityId))
      .returning();

    if (!updatedEntity) {
      return c.json(createErrorResponse('Entity not found'), 404);
    }

    // Parse JSON fields for response
    const entityResponse = {
      ...updatedEntity,
      data: JSON.parse(updatedEntity.data),
      metadata: JSON.parse(updatedEntity.metadata),
    };

    return c.json(createSuccessResponse(entityResponse, 'Entity updated successfully'));
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Update entity error');
    return c.json(createErrorResponse('Failed to update entity'), 500);
  }
});

// Delete entity
data.delete('/entities/:id', jwtAuth(jwtConfig.secret), async (c: Context) => {
  try {
    const entityId = c.req.param('id');
    
    const deletedEntities = await db.delete(entities).where(eq(entities.id, entityId)).returning();
    
    if (deletedEntities.length === 0) {
      return c.json(createErrorResponse('Entity not found'), 404);
    }

    return c.json(createSuccessResponse(null, 'Entity deleted successfully'));
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Delete entity error');
    return c.json(createErrorResponse('Failed to delete entity'), 500);
  }
});

// Get entity types
data.get('/entity-types', jwtAuth(jwtConfig.secret), async (c: Context) => {
  try {
    // Get distinct types from entities
    const typesResult = await db.selectDistinct({ type: entities.type }).from(entities);
    const types = typesResult.map(row => row.type);

    return c.json(createSuccessResponse(types));
  } catch (error) {
    const logger = (c as any).logger;
    logger.error(error, 'Get entity types error');
    return c.json(createErrorResponse('Failed to get entity types'), 500);
  }
});

export default data;