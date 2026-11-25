import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  ValidateIf,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PageQueryDto } from '../common/pagination';

export class CheckoutDto {
  @IsUUID()
  challanId: string;
}

/** Simulated gateway form. These values are processed in memory and never stored or logged. */
export class AuthorizeDto {
  @IsUUID()
  paymentId: string;

  @IsOptional()
  @IsIn(['MOCK_CARD', 'MOCK_JAZZCASH', 'MOCK_EASYPAISA', 'MOCK_BANK_TRANSFER'], {
    message: 'Choose card, JazzCash, Easypaisa or bank transfer.',
  })
  method?: 'MOCK_CARD' | 'MOCK_JAZZCASH' | 'MOCK_EASYPAISA' | 'MOCK_BANK_TRANSFER';

  @ValidateIf((o: AuthorizeDto) => o.method === 'MOCK_BANK_TRANSFER')
  @Matches(/^[A-Z0-9-]{6,40}$/, {
    message: 'Enter a bank transfer reference (6 to 40 uppercase letters, digits or hyphens).',
  })
  transferReference?: string;

  @ValidateIf((o: AuthorizeDto) => o.method === 'MOCK_JAZZCASH' || o.method === 'MOCK_EASYPAISA')
  @Matches(/^03\d{9}$/, { message: 'Enter an 11 digit wallet mobile number starting with 03.' })
  mobileNumber?: string;

  @ValidateIf(
    (o: AuthorizeDto) => o.method === undefined || o.method === null || o.method === 'MOCK_CARD',
  )
  @IsNotEmpty({ message: 'Enter the cardholder name.' })
  @IsString()
  @MaxLength(80)
  cardholderName: string;

  @ValidateIf(
    (o: AuthorizeDto) => o.method === undefined || o.method === null || o.method === 'MOCK_CARD',
  )
  @Matches(/^[0-9 ]{12,23}$/, { message: 'Enter a valid card number.' })
  cardNumber: string;

  @ValidateIf(
    (o: AuthorizeDto) => o.method === undefined || o.method === null || o.method === 'MOCK_CARD',
  )
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: 'Enter the expiry as MM/YY.' })
  expiry: string;

  @ValidateIf(
    (o: AuthorizeDto) => o.method === undefined || o.method === null || o.method === 'MOCK_CARD',
  )
  @Matches(/^\d{3,4}$/, { message: 'Enter the 3 or 4 digit security code.' })
  cvv: string;
}

/** GET /payments/mine: page query plus the "Show failed attempts" toggle ("true"/"false" in the query string). */
export class MyPaymentsQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean({ message: 'includeFailed must be true or false.' })
  includeFailed?: boolean;
}
