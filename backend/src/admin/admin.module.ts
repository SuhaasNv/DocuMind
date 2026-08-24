import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RagModule } from '../rag/rag.module.js';

@Module({
  imports: [
    PrismaModule,
    RagModule,
    BullModule.registerQueue({ name: 'document-processing' }),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
