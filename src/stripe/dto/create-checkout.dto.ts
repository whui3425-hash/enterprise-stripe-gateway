import { IsString, IsUUID } from 'class-validator';

export class CreateCheckoutDto {
  @IsUUID('4')
  userId: string;

  @IsString()
  priceId: string;
}
