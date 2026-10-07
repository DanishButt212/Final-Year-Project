import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { StorageService } from './storage.service';

/** STORAGE_DRIVER=local (default, files under UPLOAD_DIR) or s3 (any S3-compatible bucket). */
export function createStorage(config: ConfigService): StorageService {
  return config.get<string>('STORAGE_DRIVER') === 's3'
    ? new S3StorageService(config)
    : new LocalStorageService(config);
}

@Global()
@Module({
  providers: [{ provide: StorageService, useFactory: createStorage, inject: [ConfigService] }],
  exports: [StorageService],
})
export class StorageModule {}
