import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { buildTypeOrmOptions } from './database/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { ProductsModule } from './modules/products/products.module';
import { SourcesModule } from './modules/sources/sources.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
    AuthModule,
    UsersModule,
    EmployeesModule,
    SuppliersModule,
    SourcesModule,
    ClientsModule,
    ProductsModule,
  ],
  providers: [
    // Every route needs a valid access token unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // ...and the roles listed in @Roles(), when present.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
