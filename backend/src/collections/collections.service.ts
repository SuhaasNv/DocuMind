import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatCacheService } from '../rag/chat-cache.service.js';
import type {
  CollectionResponseDto,
  CollectionDocumentSummaryDto,
} from './dto/collection-response.dto.js';

/**
 * Cache scope key for a collection chat: collectionId plus a stable digest of
 * the (sorted) member document ids. Any membership change yields a new scope,
 * so stale cross-document answers can never be served after add/remove.
 */
export function collectionCacheScope(
  collectionId: string,
  memberDocumentIds: string[],
): string {
  const digest = createHash('sha256')
    .update([...memberDocumentIds].sort().join('\n'))
    .digest('hex')
    .slice(0, 16);
  return `col:${collectionId}:${digest}`;
}

/** Membership row shape used for ownership checks and scope computation. */
interface OwnedCollection {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  documents: Array<{
    document: { id: string; name: string; status: DocumentStatus };
  }>;
}

const COLLECTION_INCLUDE = {
  documents: {
    include: {
      document: { select: { id: true, name: true, status: true } },
    },
  },
} as const;

/**
 * Collections CRUD + membership. Every method takes the caller's userId and
 * enforces ownership of the collection AND of any document being added.
 * userId always comes from the JWT — never from the client payload.
 */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatCache: ChatCacheService,
  ) {}

  async create(userId: string, name: string): Promise<CollectionResponseDto> {
    const collection = await this.prisma.collection.create({
      data: { userId, name },
      include: COLLECTION_INCLUDE,
    });
    return this.toResponse(collection);
  }

  async findAllByUser(userId: string): Promise<CollectionResponseDto[]> {
    const collections = await this.prisma.collection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: COLLECTION_INCLUDE,
    });
    return collections.map((c) => this.toResponse(c));
  }

  async findOne(id: string, userId: string): Promise<CollectionResponseDto> {
    return this.toResponse(await this.findOwned(id, userId));
  }

  async rename(
    id: string,
    userId: string,
    name: string,
  ): Promise<CollectionResponseDto> {
    await this.findOwned(id, userId);
    const updated = await this.prisma.collection.update({
      where: { id },
      data: { name },
      include: COLLECTION_INCLUDE,
    });
    return this.toResponse(updated);
  }

  async remove(id: string, userId: string): Promise<void> {
    const collection = await this.findOwned(id, userId);
    void this.chatCache.invalidateScope(this.scopeOf(collection));
    await this.prisma.collection.delete({ where: { id } });
  }

  /**
   * Add a document to a collection. The collection AND the document must both
   * belong to the caller — adding someone else's document is a 403, so a
   * collection can never become a read window into another user's data.
   */
  async addDocument(
    collectionId: string,
    userId: string,
    documentId: string,
  ): Promise<CollectionResponseDto> {
    const collection = await this.findOwned(collectionId, userId);
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, userId: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Membership changes ⇒ drop cached answers for the current membership.
    void this.chatCache.invalidateScope(this.scopeOf(collection));

    await this.prisma.collectionDocument.upsert({
      where: { collectionId_documentId: { collectionId, documentId } },
      create: { collectionId, documentId },
      update: {},
    });
    return this.findOne(collectionId, userId);
  }

  async removeDocument(
    collectionId: string,
    userId: string,
    documentId: string,
  ): Promise<CollectionResponseDto> {
    const collection = await this.findOwned(collectionId, userId);
    void this.chatCache.invalidateScope(this.scopeOf(collection));
    await this.prisma.collectionDocument.deleteMany({
      where: { collectionId, documentId },
    });
    return this.findOne(collectionId, userId);
  }

  /**
   * Chat target for a collection: cache scope over ALL member ids plus the
   * DONE member documents to retrieve across (ownership already enforced).
   */
  async getChatTarget(
    collectionId: string,
    userId: string,
  ): Promise<{
    scope: string;
    documents: Array<{ id: string; name: string }>;
  }> {
    const collection = await this.findOwned(collectionId, userId);
    return {
      scope: this.scopeOf(collection),
      documents: collection.documents
        .filter((m) => m.document.status === DocumentStatus.DONE)
        .map((m) => ({ id: m.document.id, name: m.document.name })),
    };
  }

  private async findOwned(
    id: string,
    userId: string,
  ): Promise<OwnedCollection> {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: COLLECTION_INCLUDE,
    });
    if (!collection) {
      throw new NotFoundException('Collection not found');
    }
    if (collection.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return collection;
  }

  private scopeOf(collection: OwnedCollection): string {
    return collectionCacheScope(
      collection.id,
      collection.documents.map((m) => m.document.id),
    );
  }

  private toResponse(collection: OwnedCollection): CollectionResponseDto {
    const documents: CollectionDocumentSummaryDto[] = collection.documents.map(
      (m) => m.document,
    );
    return {
      id: collection.id,
      name: collection.name,
      createdAt: collection.createdAt,
      documentCount: documents.length,
      documents,
    };
  }
}
