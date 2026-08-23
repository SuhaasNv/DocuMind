import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ShareController } from './share.controller.js';
import { ShareService } from './share.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ShareController],
  providers: [ShareService],
})
export class ShareModule {}
