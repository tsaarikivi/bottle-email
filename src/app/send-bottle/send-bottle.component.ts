import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material';

@Component({
  selector: 'app-send-bottle',
  templateUrl: './send-bottle.component.html',
  styleUrls: ['./send-bottle.component.scss']
})
export class SendBottleComponent implements OnInit {
  form: FormGroup;
  status = 'writing';

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.form = this.formFactory();
  }

  async handleSubmit() {
    this.status = 'sending';
    try {
      const { text, email, time }: { [key: string]: string } = this.form.value;
      const nineAmTime = time.toString().replace('00:00:00', '09:00:00');
      const body = {
        text,
        email,
        time: nineAmTime
      };
      await this.http
        .post(
          'https://europe-west1-bottle-email.cloudfunctions.net/newBottle',
          body,
          {
            responseType: 'text'
          }
        )
        .toPromise();
      this.status = 'success';
    } catch (err) {
      console.error(err);
      this.snackBar.open(err.message, null, {
        horizontalPosition: 'right',
        verticalPosition: 'top',
        duration: 5000,
        panelClass: 'app-error-snackbar'
      });
      this.status = 'writing';
    }
  }

  private formFactory() {
    return this.fb.group({
      text: this.fb.control(null, Validators.required),
      email: this.fb.control(null, [Validators.required, Validators.email]),
      time: this.fb.control(null, Validators.required)
    });
  }
}
