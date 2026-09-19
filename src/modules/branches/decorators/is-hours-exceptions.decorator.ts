import { registerDecorator, ValidationOptions } from 'class-validator';
import { parseHoursExceptions } from '../utils/branch-hours.util';

export function IsHoursExceptions(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isHoursExceptions',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return parseHoursExceptions(value) !== null;
        },
        defaultMessage() {
          return 'hoursExceptions must be null, [] , or unique YYYY-MM-DD rows with hours { open, close } or null (closed that date)';
        },
      },
    });
  };
}
