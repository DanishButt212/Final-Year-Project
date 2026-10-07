import { Module } from '@nestjs/common';
import { JitsiVideoProvider, VIDEO_PROVIDER } from './video-provider';
import {
  AdminVirtualCourtroomController,
  VirtualCourtroomController,
} from './virtual-courtroom.controller';
import { VirtualCourtroomService } from './virtual-courtroom.service';

/** Starts without the JAAS_* settings: the provider then falls back to public meet.jit.si. */
@Module({
  controllers: [AdminVirtualCourtroomController, VirtualCourtroomController],
  providers: [VirtualCourtroomService, { provide: VIDEO_PROVIDER, useClass: JitsiVideoProvider }],
})
export class VirtualCourtroomModule {}
