import { Global, Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { StorageService } from './storage.service';

/** Swap `useClass` for a cloud implementation later; nothing else needs to change. */
@Global()
@Module({
  providers: [{ provide: StorageService, useClass: LocalStorageService }],
  exports: [StorageService],
})
export class StorageModule {}
