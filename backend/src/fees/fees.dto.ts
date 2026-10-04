import { IsNotEmpty, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CheckoutDto {
  @IsUUID()
  challanId: string;
}

/** Simulated gateway form. These values are processed in memory and never stored or logged. */
export class AuthorizeDto {
  @IsUUID()
  paymentId: string;

  @IsNotEmpty({ message: 'Enter the cardholder name.' })
  @IsString()
  @MaxLength(80)
  cardholderName: string;

  @Matches(/^[0-9 ]{12,23}$/, { message: 'Enter a valid card number.' })
  cardNumber: string;

  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: 'Enter the expiry as MM/YY.' })
  expiry: string;

  @Matches(/^\d{3,4}$/, { message: 'Enter the 3 or 4 digit security code.' })
  cvv: string;
}
